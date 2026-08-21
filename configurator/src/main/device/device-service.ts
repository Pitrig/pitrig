import { SerialPort } from 'serialport'

import {
  controlCommandRefusal,
  type ControlCommandValue,
  type SerialTrafficLog
} from '../../shared/debug'
import {
  AUTOMATIC_BAUD_RATES,
  type DeviceConfiguration,
  type DeviceConfigurationResetResult,
  type DeviceConfigurationApplyResult,
  type DeviceConfigurationSaveResult,
  type DeviceConnection,
  type DeviceError,
  type DeviceResult,
  type DeviceSession,
  type DeviceState,
  type SerialPortSummary
} from '../../shared/device'
import {
  CONFIGURATION_DOCUMENTS,
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '../../shared/configuration-schema'
import type { AssetUploadProgress } from '../../shared/asset-upload'
import type { FontUploadProgress } from '../../shared/font-assets'
import {
  DeviceServiceError,
  failure,
  success,
  toDeviceError
} from './device-errors'
import { readPackageFamilies } from '../font-assets/font-package'
import { uploadAssetPackage } from './asset-upload'
import { documentOf, mergeDocument } from '../../shared/configuration-documents'
import { prepareDeviceConfigurationJson } from './configuration-json'
import { isBluetoothPort, PortRegistry, serialIdentity, type PortRecord } from './port-registry'
import { closePort, openPort } from './serial-port-lifecycle'
import { SerialTrafficReporter } from './serial-traffic-reporter'
import {
  clearFontAssets,
  clearImageAssets,
  probeSimCore,
  readConfiguration,
  requestResponse,
  resetConfiguration,
  resetConfigurationDocument,
  applyConfiguration,
  saveConfiguration,
  sendControlCommand,
} from './simcore-protocol'

/**
 * Coming back after a restart, paced so the board is left alone while it boots.
 *
 * Opening a serial port asserts DTR, which on these boards is a reset line — so
 * an eager reconnect does not merely fail, it resets a board that was halfway
 * through starting, and a tight retry loop can hold one in that state. Hence a
 * settle window before the port is touched at all, a poll that only *looks* for
 * the port, and a real pause between attempts that actually open it.
 */
const RECONNECT_SETTLE_MS = 2_500
const RECONNECT_TIMEOUT_MS = 30_000
const RECONNECT_POLL_MS = 750
const RECONNECT_RETRY_MS = 2_000
const RECONNECT_MAXIMUM_ATTEMPTS = 5

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

interface Match {
  record: PortRecord
  baudRate: number
}

interface OpenedDevice {
  port: SerialPort
  session: DeviceSession
  traffic: SerialTrafficReporter
}

export class DeviceService {
  private readonly portRegistry = new PortRegistry()
  private state: DeviceState = { status: 'disconnected' }
  private activePort: SerialPort | undefined
  private activeTraffic: SerialTrafficReporter | undefined
  private detachActiveListeners: (() => void) | undefined
  private pendingPort: SerialPort | undefined
  private operationToken = 0
  private deviceOperationActive = false
  /**
   * Held for a whole save-to-board pipeline, which is several device commands
   * with the author's document riding on all of them. `deviceOperationActive`
   * is released between each of those, and live apply is automatic — without
   * this, a debounced apply lands between the font upload and the save.
   */
  private pipelineActive = false

  constructor(
    private readonly onStateChanged: (state: DeviceState) => void,
    private readonly onSerialTraffic?: (log: SerialTrafficLog) => void
  ) {}

  getState(): DeviceState {
    return this.state
  }

  async listPorts(): Promise<DeviceResult<SerialPortSummary[]>> {
    try {
      const records = await this.refreshPortRegistry()
      return success(records.map(({ summary }) => summary))
    } catch (error) {
      return failure(toDeviceError(error))
    }
  }

  async connect(portId: string, baudRate: number): Promise<DeviceResult<DeviceState>> {
    if (this.isBusy()) {
      return failure({ code: 'busy', message: 'Another device operation is already running.' })
    }
    return this.openConnection(portId, baudRate)
  }

  /**
   * Connecting without the pipeline check, because a save's own reconnect runs
   * *inside* the pipeline: asking `connect` would have it refuse itself.
   */
  private async openConnection(
    portId: string,
    baudRate: number,
    quiet = false
  ): Promise<DeviceResult<DeviceState>> {
    if (this.activePort?.isOpen) {
      return failure({ code: 'busy', message: 'A device is already connected.' })
    }

    const record = this.portRegistry.get(portId)
    if (!record) {
      const error: DeviceError = {
        code: 'port_missing',
        message: 'The selected serial port is no longer available. Refresh the port list.'
      }
      if (!quiet) this.setState({ status: 'error', error })
      return failure(error)
    }

    const token = ++this.operationToken
    this.setState({ status: 'connecting' })
    try {
      const opened = await this.openAndProbe(record, baudRate, token)
      this.attachActivePort(opened, record, baudRate)
      return success(this.state)
    } catch (error) {
      // A quiet attempt is one of several: reporting each failure would flash
      // an error the next attempt is about to disprove.
      if (quiet) return failure(toDeviceError(error))
      return this.finishFailedOperation(error, token)
    }
  }

  async autoConnect(): Promise<DeviceResult<DeviceState>> {
    if (this.isBusy()) {
      return failure({ code: 'busy', message: 'Another device operation is already running.' })
    }
    if (this.activePort?.isOpen) {
      return failure({ code: 'busy', message: 'A device is already connected.' })
    }

    const token = ++this.operationToken
    this.setState({ status: 'scanning' })

    try {
      const records = await this.refreshPortRegistry()
      this.ensureCurrent(token)
      const candidates = records.filter(
        ({ likelyUsb, path }) => likelyUsb && !isBluetoothPort(path)
      )
      if (candidates.length === 0) {
        throw new DeviceServiceError('no_device', 'No USB serial ports were found.')
      }

      const totalAttempts = candidates.length * AUTOMATIC_BAUD_RATES.length
      const matches: Match[] = []
      const blockedErrors: DeviceError[] = []
      let attempt = 0

      for (const record of candidates) {
        for (const baudRate of AUTOMATIC_BAUD_RATES) {
          this.ensureCurrent(token)
          attempt += 1
          this.setState({
            status: 'scanning',
            scan: {
              displayName: record.summary.displayName,
              baudRate,
              attempt,
              totalAttempts
            }
          })

          try {
            const opened = await this.openAndProbe(record, baudRate, token)
            await closePort(opened.port)
            opened.traffic.flush()
            matches.push({ record, baudRate })
            break
          } catch (error) {
            this.ensureCurrent(token)
            const deviceError = toDeviceError(error)
            if (deviceError.code === 'cancelled') {
              throw error
            }
            if (
              deviceError.code === 'port_busy' ||
              deviceError.code === 'permission_denied'
            ) {
              blockedErrors.push(deviceError)
              break
            }
          }
        }
      }

      this.ensureCurrent(token)
      if (matches.length === 0) {
        const blocked = blockedErrors[0]
        if (blocked) {
          throw new DeviceServiceError(blocked.code, blocked.message)
        }
        throw new DeviceServiceError(
          'no_device',
          'No compatible SimCore device responded to the INFO probe.'
        )
      }
      if (matches.length > 1) {
        throw new DeviceServiceError(
          'multiple_devices',
          'Multiple SimCore devices were found. Select a port manually.'
        )
      }

      const match = matches[0]
      if (!match) {
        throw new DeviceServiceError('no_device', 'No SimCore device was found.')
      }
      this.setState({ status: 'connecting' })
      const opened = await this.openAndProbe(match.record, match.baudRate, token)
      this.attachActivePort(opened, match.record, match.baudRate)
      return success(this.state)
    } catch (error) {
      return this.finishFailedOperation(error, token)
    }
  }

  async cancelAutoConnect(): Promise<DeviceResult<DeviceState>> {
    if (this.state.status !== 'scanning' && this.state.status !== 'connecting') {
      return success(this.state)
    }
    ++this.operationToken
    const pending = this.pendingPort
    this.pendingPort = undefined
    await closePort(pending)
    this.setState({ status: 'disconnected' })
    return success(this.state)
  }

  async disconnect(): Promise<DeviceResult<DeviceState>> {
    if (this.deviceOperationActive) {
      return failure({
        code: 'busy',
        message: 'Cancel the active device operation before disconnecting.'
      })
    }
    await this.closeDevicePorts()
    return success(this.state)
  }

  async readConfiguration(): Promise<DeviceResult<DeviceState>> {
    return this.runOperation(async ({ port, session, traffic }) => {
      const configuration = await readConfiguration(
        port,
        session.info.boardId,
        this.operationTraffic(traffic)
      )
      if (this.activePort !== port || this.state.session !== session) {
        throw new DeviceServiceError('serial_error', 'The connected device changed during read.')
      }
      this.setState({ ...this.state, session: { ...session, configuration } })
      return success(this.state)
    })
  }

  // Live apply competes with nothing: it is rejected while another device
  // operation holds the lock rather than queued, because the caller sends a
  // fresh document moments later anyway. The pipeline flag is checked here and
  // not in getActiveDevice, because a save's own commands run inside it.
  async applyConfiguration(
    json: string,
    documents?: ConfigurationDocumentId[]
  ): Promise<DeviceResult<DeviceConfigurationApplyResult>> {
    if (this.pipelineActive) {
      return failure({ code: 'busy', message: 'A save is running on the connected device.' })
    }
    return this.applyConfigurationNow(json, documents)
  }

  /**
   * The same apply, without the pipeline guard above it.
   *
   * That guard keeps a *debounced* live apply from landing between a save's own
   * commands. A save's closing apply — the one that brings the running dashboard
   * up to the document just written to NVS — is the one call it must not refuse,
   * and it is issued by the pipeline itself rather than raced into it.
   */
  async applyConfigurationNow(
    json: string,
    documents?: ConfigurationDocumentId[]
  ): Promise<DeviceResult<DeviceConfigurationApplyResult>> {
    return this.runOperation(async ({ port, session, traffic }) => {
      const prepared = this.prepareConfiguration(json, session)
      if (!prepared.ok) return prepared
      // The protocol document is never applied: the transport is bound once at
      // startup, so sending it would only make the board stage bytes it cannot
      // act on. It reaches the device through a save and a restart.
      const selected = (documents ?? [...CONFIGURATION_DOCUMENT_IDS]).filter(
        (document) => !CONFIGURATION_DOCUMENTS[document].rebootRequired
      )
      for (const document of selected) {
        await applyConfiguration(
          port,
          document,
          prepared.value.payloads[document],
          this.operationTraffic(traffic)
        )
      }
      return success({ configuration: prepared.value.configuration, documents: selected })
    })
  }

  async saveConfiguration(
    json: string,
    documents?: ConfigurationDocumentId[]
  ): Promise<DeviceResult<DeviceConfigurationSaveResult>> {
    return this.runOperation(async ({ port, session, traffic }) => {
      const prepared = this.prepareConfiguration(json, session)
      if (!prepared.ok) return prepared
      // Protocol first, then modules, then the dashboard. A write that fails
      // part way should leave the cheap documents done and the expensive one
      // untouched rather than the other way round.
      const requested = documents ?? [...CONFIGURATION_DOCUMENT_IDS]
      const selected = CONFIGURATION_DOCUMENT_IDS.filter((document) =>
        requested.includes(document)
      ).reverse()
      for (const document of selected) {
        await saveConfiguration(
          port,
          document,
          prepared.value.payloads[document],
          this.operationTraffic(traffic)
        )
      }
      // What the board holds in flash is now what was just written. Recording it
      // keeps the next save from finding the documents it already wrote still
      // "different" and writing them a second time, which is what a stale
      // session used to make it do.
      if (this.activePort === port && this.state.session === session) {
        let held = session.configuration
        for (const document of selected) {
          held = mergeDocument(held, document, documentOf(prepared.value.configuration, document))
        }
        this.setState({ ...this.state, session: { ...session, configuration: held } })
      }
      return success({
        configuration: prepared.value.configuration,
        documents: selected,
        rebootRequired: selected.some(
          (document) => CONFIGURATION_DOCUMENTS[document].rebootRequired
        )
      })
    })
  }

  /**
   * One line typed by hand, and whatever the board answers.
   *
   * It takes the same operation lock as every other command, so a console
   * cannot interleave itself with a live apply or a save; and it is refused
   * before the lock when the line would open a binary session, because that
   * would leave the router waiting for frames a console cannot send.
   */
  async sendControlCommand(command: string): Promise<DeviceResult<ControlCommandValue>> {
    const refusal = controlCommandRefusal(command)
    if (refusal) return failure({ code: 'invalid_request', message: refusal })
    return this.runOperation(async ({ port, traffic }) => {
      const lines = await sendControlCommand(port, command.trim(), this.operationTraffic(traffic))
      return success({ lines })
    })
  }

  /**
   * Erases stored configuration: one document, or every one of them when none
   * is named.
   *
   * What the board will run afterwards is that document's compiled factory
   * value, which only a restart loads — the firmware has no serializer to
   * report it with. So the configuration answered here is what a reset board
   * comes up with for the documents that were erased: the board identifier and
   * nothing else. The ones left alone keep what the session already holds.
   */
  async resetConfiguration(
    document?: ConfigurationDocumentId
  ): Promise<DeviceResult<DeviceConfigurationResetResult>> {
    return this.runOperation(async ({ port, session, traffic }) => {
      const traffic_ = this.operationTraffic(traffic)
      const erased = document ? [document] : [...CONFIGURATION_DOCUMENT_IDS]
      if (document) await resetConfigurationDocument(port, document, traffic_)
      else await resetConfiguration(port, traffic_)
      let configuration: DeviceConfiguration = session.configuration
      for (const id of erased) {
        configuration = mergeDocument(configuration, id, { board: session.info.boardId })
      }
      return success({ configuration, documents: erased, rebootRequired: true })
    })
  }

  async clearImages(): Promise<DeviceResult<DeviceState>> {
    return this.clearAssets(
      (session) => session.imageAssets !== undefined,
      'The connected firmware does not support image management.',
      'The connected device changed during image cleanup.',
      clearImageAssets,
      (session) => ({
        ...session,
        imageAssets: {
          ...session.imageAssets!,
          packageAvailable: false,
          formatVersion: 0,
          images: [],
          packageSize: 0,
          rebootRequired: true
        }
      })
    )
  }

  async clearFonts(): Promise<DeviceResult<DeviceState>> {
    return this.clearAssets(
      (session) => session.fontAssets !== undefined,
      'The connected firmware does not support font asset management.',
      'The connected device changed during font cleanup.',
      clearFontAssets,
      (session) => ({
        ...session,
        fontAssets: {
          ...session.fontAssets!,
          packageAvailable: false,
          formatVersion: 0,
          familyCount: 0,
          families: [],
          packageSize: 0,
          rebootRequired: true
        }
      })
    )
  }

  /**
   * Clearing a font package and clearing an image package differ only in the
   * command sent and in which half of the session the reply invalidates, so the
   * guard, the mid-operation identity check and the bookkeeping live here once.
   */
  private async clearAssets(
    supported: (session: DeviceSession) => boolean,
    unsupportedMessage: string,
    changedMessage: string,
    clear: (
      port: SerialPort,
      onTraffic: (direction: 'rx' | 'tx', data: string) => void
    ) => Promise<void>,
    advance: (session: DeviceSession) => DeviceSession
  ): Promise<DeviceResult<DeviceState>> {
    return this.runOperation(async ({ port, session, traffic }) => {
      if (!supported(session)) {
        return failure({ code: 'not_simcore', message: unsupportedMessage })
      }
      await clear(port, this.operationTraffic(traffic))
      if (this.activePort !== port || this.state.session !== session) {
        throw new DeviceServiceError('serial_error', changedMessage)
      }
      this.setState({ ...this.state, session: advance(session) })
      return success(this.state)
    })
  }

  private async closeDevicePorts(): Promise<void> {
    ++this.operationToken
    this.setState({ status: 'disconnecting' })

    const pending = this.pendingPort
    const active = this.activePort
    const traffic = this.activeTraffic
    this.pendingPort = undefined
    this.activePort = undefined
    this.activeTraffic = undefined
    this.detachActiveListeners?.()
    this.detachActiveListeners = undefined
    await Promise.all([closePort(pending), closePort(active)])
    traffic?.flush()
    this.setState({ status: 'disconnected' })
  }

  async reboot(): Promise<DeviceResult<DeviceState>> {
    const port = this.activePort
    const connection = this.state.connection
    const traffic = this.activeTraffic
    if (!port?.isOpen || !connection || this.deviceOperationActive) {
      return failure({ code: 'busy', message: 'The connected device is busy or unavailable.' })
    }
    this.deviceOperationActive = true
    try {
      await requestResponse(
        port,
        '@SC:REBOOT\n',
        '@SC:OK:REBOOTING',
        2_000,
        (direction, data) => {
          // RX is already observed by the active port listener.
          if (direction === 'tx') traffic?.write(direction, data)
        },
        'serial_error'
      )
      this.activePort = undefined
      this.activeTraffic = undefined
      this.detachActiveListeners?.()
      this.detachActiveListeners = undefined
      await closePort(port)
      traffic?.flush()
      this.setState({ status: 'disconnected' })
      return success(this.state)
    } catch (error) {
      return failure(toDeviceError(error))
    } finally {
      this.deviceOperationActive = false
    }
  }

  async uploadFonts(
    packageBytes: Uint8Array,
    onProgress: (progress: FontUploadProgress) => void,
    signal: AbortSignal,
    /** The package's payload CRC, so a second save this session can skip. */
    payloadCrc?: number
  ): Promise<void> {
    return this.uploadAssets(
      { command: 'FONT', label: 'font' },
      packageBytes,
      onProgress,
      signal,
      (session, bytes) => {
        if (!session.fontAssets) return undefined
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        return {
          ...session,
          fontAssets: {
            ...session.fontAssets,
            packageAvailable: true,
            formatVersion: view.getUint16(4, true),
            familyCount: view.getUint16(12, true),
            families: readPackageFamilies(bytes),
            packageSize: bytes.byteLength,
            // The board reports what it holds only after a restart, so this
            // moves the session on from what was just sent.
            payloadCrc: payloadCrc ?? view.getUint32(24, true),
            rebootRequired: true
          }
        }
      }
    )
  }

  /**
   * Uploads an image package. The device answers a second upload with `busy`
   * while one owns the serial link, and this guard keeps the configurator from
   * asking in the first place.
   */
  async uploadImages(
    packageBytes: Uint8Array,
    onProgress: (progress: AssetUploadProgress) => void,
    signal: AbortSignal
  ): Promise<void> {
    return this.uploadAssets(
      { command: 'IMAGE', label: 'image' },
      packageBytes,
      onProgress,
      signal,
      (session, bytes) =>
        session.imageAssets
          ? {
              ...session,
              imageAssets: {
                ...session.imageAssets,
                packageAvailable: true,
                packageSize: bytes.byteLength,
                rebootRequired: true
              }
            }
          : undefined
    )
  }

  /**
   * Uploads an application image into the inactive firmware slot. The device
   * refuses one built for another board, so the package that reaches here
   * already carries the board it was wrapped for.
   */
  async uploadFirmware(
    packageBytes: Uint8Array,
    onProgress: (progress: AssetUploadProgress) => void,
    signal: AbortSignal
  ): Promise<void> {
    return this.uploadAssets(
      { command: 'FW', label: 'firmware' },
      packageBytes,
      onProgress,
      signal,
      (session) =>
        session.firmware
          ? { ...session, firmware: { ...session.firmware, rebootRequired: true } }
          : undefined
    )
  }

  /**
   * One package upload, whatever the kind. The device reports the installed set
   * only after a restart, so `advance` moves the session on from what was just
   * sent rather than re-probing; returning undefined leaves it untouched.
   */
  private async uploadAssets(
    namespace: { command: 'FONT' | 'IMAGE' | 'FW'; label: string },
    packageBytes: Uint8Array,
    onProgress: (progress: AssetUploadProgress) => void,
    signal: AbortSignal,
    advance: (session: DeviceSession, packageBytes: Uint8Array) => DeviceSession | undefined
  ): Promise<void> {
    const port = this.activePort
    const connection = this.state.connection
    const session = this.state.session
    const traffic = this.activeTraffic
    if (!port?.isOpen || !connection || !session) {
      throw new DeviceServiceError('serial_error', 'No SimCore device is connected.')
    }
    if (this.deviceOperationActive) {
      throw new DeviceServiceError('busy', 'Another device operation is already running.')
    }
    this.deviceOperationActive = true
    try {
      await uploadAssetPackage(
        port,
        namespace,
        packageBytes,
        {
          onProgress,
          onTransmit: (data: string, encoding: 'utf8' | 'hex') =>
            traffic?.write('tx', data, encoding)
        },
        signal
      )
      if (this.state.session !== session) return
      const next = advance(session, packageBytes)
      if (next) this.setState({ ...this.state, session: next })
    } finally {
      this.deviceOperationActive = false
    }
  }

  async dispose(): Promise<void> {
    await this.closeDevicePorts()
  }

  private async refreshPortRegistry(): Promise<PortRecord[]> {
    return this.portRegistry.refresh()
  }

  /**
   * Every device command is the same shape: take the connected device, hold
   * the operation lock, do the work, release the lock whatever happens, and
   * report a failure as a DeviceError rather than a thrown one. Seven commands
   * spelled that out in full, which is seven chances to leave the lock held.
   */
  private async runOperation<T>(
    work: (device: OpenedDevice) => Promise<DeviceResult<T>>
  ): Promise<DeviceResult<T>> {
    const active = this.getActiveDevice()
    if (!active.ok) return failure(active.error)
    this.deviceOperationActive = true
    try {
      return await work(active.value)
    } catch (error) {
      return failure(toDeviceError(error))
    } finally {
      this.deviceOperationActive = false
    }
  }

  private getActiveDevice(): DeviceResult<OpenedDevice> {
    const port = this.activePort
    const session = this.state.session
    const traffic = this.activeTraffic
    if (!port?.isOpen || !session || !traffic) {
      return failure({ code: 'serial_error', message: 'No SimCore device is connected.' })
    }
    if (this.deviceOperationActive) {
      return failure({ code: 'busy', message: 'Another device operation is already running.' })
    }
    return success({ port, session, traffic })
  }

  private prepareConfiguration(
    json: string,
    session: DeviceSession
  ): DeviceResult<{
    configuration: DeviceConfiguration
    payloads: Record<ConfigurationDocumentId, string>
  }> {
    try {
      return success(prepareDeviceConfigurationJson(json, session.info.boardId))
    } catch (error) {
      return failure({
        code: 'configuration_rejected',
        message: error instanceof Error ? error.message : 'Invalid device configuration.'
      })
    }
  }

  private operationTraffic(traffic: SerialTrafficReporter): (
    direction: 'rx' | 'tx',
    data: string
  ) => void {
    return (direction, data) => {
      // RX is observed by the listener attached for the active connection.
      if (direction === 'tx') traffic.write(direction, data)
    }
  }

  private async openAndProbe(
    record: PortRecord,
    baudRate: number,
    token: number
  ): Promise<OpenedDevice> {
    this.ensureCurrent(token)
    const port = new SerialPort({
      path: record.path,
      baudRate,
      autoOpen: false,
      lock: true
    })
    this.pendingPort = port
    const traffic = new SerialTrafficReporter(this.onSerialTraffic, record.path, baudRate)

    try {
      await openPort(port)
      this.ensureCurrent(token)
      const session = await probeSimCore(port, (direction, data) => traffic.write(direction, data))
      this.ensureCurrent(token)
      this.pendingPort = undefined
      return { port, session, traffic }
    } catch (error) {
      if (this.pendingPort === port) {
        this.pendingPort = undefined
      }
      await closePort(port)
      traffic.flush()
      throw error
    }
  }

  private attachActivePort(opened: OpenedDevice, record: PortRecord, baudRate: number): void {
    const { port, session, traffic } = opened
    this.activePort = port
    this.activeTraffic = traffic
    const onData = (chunk: Buffer): void => {
      traffic.write('rx', chunk.toString('utf8'))
    }
    const onClose = (): void => {
      if (this.activePort !== port) {
        return
      }
      this.activePort = undefined
      this.activeTraffic = undefined
      this.detachActiveListeners?.()
      this.detachActiveListeners = undefined
      traffic.flush()
      this.setState({
        status: 'error',
        error: {
          code: 'serial_error',
          message: 'The serial device was disconnected.'
        }
      })
    }
    const onError = (error: Error): void => {
      if (this.activePort === port) {
        this.setState({ status: 'error', error: toDeviceError(error) })
      }
    }
    this.detachActiveListeners = (): void => {
      port.off('data', onData)
      port.off('close', onClose)
      port.off('error', onError)
    }
    port.on('data', onData)
    port.once('close', onClose)
    port.on('error', onError)

    const connection: DeviceConnection = {
      portId: record.summary.id,
      path: record.path,
      displayName: record.summary.displayName,
      baudRate
    }
    this.setState({ status: 'connected', connection, session })
  }

  private finishFailedOperation(error: unknown, token: number): DeviceResult<DeviceState> {
    const deviceError = toDeviceError(error)
    if (token === this.operationToken) {
      this.setState({ status: 'error', error: deviceError })
    }
    return failure(deviceError)
  }

  private ensureCurrent(token: number): void {
    if (token !== this.operationToken) {
      throw new DeviceServiceError('cancelled', 'Device scan was cancelled.')
    }
  }

  private isBusy(): boolean {
    return this.deviceOperationActive || this.pipelineActive ||
      ['scanning', 'connecting', 'disconnecting'].includes(this.state.status)
  }

  /**
   * Runs a multi-command sequence with every other device caller locked out.
   * Nested single commands still take `deviceOperationActive` for themselves;
   * this only keeps anything *else* from getting in between them.
   */
  async runPipeline<T>(work: () => Promise<T>): Promise<T> {
    this.pipelineActive = true
    try {
      return await work()
    } finally {
      this.pipelineActive = false
    }
  }

  /**
   * Restarts the board and waits for it to come back on the same port.
   *
   * A font package and a saved configuration both become active only after a
   * restart, so this is the last step of a save rather than something the
   * author is asked to remember. USB-CDC re-enumeration takes as long as it
   * takes, and a board that never reappears is not a failed save — the flash is
   * already written — so the caller is told to reconnect by hand instead.
   */
  async rebootAndReconnect(): Promise<DeviceResult<DeviceState>> {
    const connection = this.state.connection
    const rebooted = await this.reboot()
    if (!rebooted.ok || !connection) return rebooted

    // Nothing touches the port until the board has had time to boot on its own.
    this.setState({ status: 'connecting' })
    await delay(RECONNECT_SETTLE_MS)

    // By path, not by identifier: the board's port identifier does not survive
    // the device disappearing, so the one we started with is gone the moment it
    // reboots.
    const wanted = serialIdentity(connection.path)
    const deadline = Date.now() + RECONNECT_TIMEOUT_MS
    let attempts = 0
    while (Date.now() < deadline && attempts < RECONNECT_MAXIMUM_ATTEMPTS) {
      let record: PortRecord | undefined
      try {
        record = (await this.refreshPortRegistry()).find(
          (candidate) => serialIdentity(candidate.path) === wanted
        )
      } catch {
        record = undefined
      }
      if (!record) {
        // Looking costs the board nothing, so this can be frequent.
        await delay(RECONNECT_POLL_MS)
        continue
      }
      attempts += 1
      const connected = await this.openConnection(record.summary.id, connection.baudRate, true)
      // The port is enumerated before the firmware answers `@SC:`, so a refused
      // probe means "not yet", not "not a SimCore board".
      if (connected.ok) return connected
      await delay(RECONNECT_RETRY_MS)
    }
    const error: DeviceError = {
      code: 'port_missing',
      message: 'The board restarted but did not come back on its port. Reconnect it by hand.'
    }
    this.setState({ status: 'error', error })
    return failure(error)
  }

  private setState(state: DeviceState): void {
    this.state = state
    this.onStateChanged(state)
  }
}
