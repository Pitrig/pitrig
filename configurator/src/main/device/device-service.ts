import { SerialPort } from 'serialport'

import type { SerialTrafficLog } from '../../shared/development'
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
import type { FontUploadProgress } from '../../shared/font-assets'
import {
  DeviceServiceError,
  failure,
  success,
  toDeviceError
} from './device-errors'
import { uploadFontPackage } from './font-upload'
import { prepareDeviceConfigurationJson } from './configuration-json'
import { isBluetoothPort, PortRegistry, type PortRecord } from './port-registry'
import { closePort, openPort } from './serial-port-lifecycle'
import { SerialTrafficReporter } from './serial-traffic-reporter'
import {
  clearFontAssets,
  probeSimCore,
  readConfiguration,
  requestResponse,
  resetConfiguration,
  applyConfiguration,
  saveConfiguration,
  validateConfiguration
} from './simcore-protocol'

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
    if (this.activePort?.isOpen) {
      return failure({ code: 'busy', message: 'A device is already connected.' })
    }

    const record = this.portRegistry.get(portId)
    if (!record) {
      const error: DeviceError = {
        code: 'port_missing',
        message: 'The selected serial port is no longer available. Refresh the port list.'
      }
      this.setState({ status: 'error', error })
      return failure(error)
    }

    const token = ++this.operationToken
    this.setState({ status: 'connecting' })
    try {
      const opened = await this.openAndProbe(record, baudRate, token)
      this.attachActivePort(opened, record, baudRate)
      return success(this.state)
    } catch (error) {
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
    const active = this.getActiveDevice()
    if (!active.ok) return failure(active.error)
    const { port, session, traffic } = active.value
    this.deviceOperationActive = true
    try {
      const configuration = await readConfiguration(
        port,
        session.info.boardId,
        this.operationTraffic(traffic)
      )
      if (this.activePort !== port || this.state.session !== session) {
        throw new DeviceServiceError('serial_error', 'The connected device changed during read.')
      }
      this.setState({
        ...this.state,
        session: { ...session, configuration }
      })
      return success(this.state)
    } catch (error) {
      return failure(toDeviceError(error))
    } finally {
      this.deviceOperationActive = false
    }
  }

  async validateConfiguration(
    json: string
  ): Promise<DeviceResult<DeviceConfiguration>> {
    const active = this.getActiveDevice()
    if (!active.ok) return failure(active.error)
    const prepared = this.prepareConfiguration(json, active.value.session)
    if (!prepared.ok) return prepared
    this.deviceOperationActive = true
    try {
      await validateConfiguration(
        active.value.port,
        prepared.value.payload,
        this.operationTraffic(active.value.traffic)
      )
      return success(prepared.value.configuration)
    } catch (error) {
      return failure(toDeviceError(error))
    } finally {
      this.deviceOperationActive = false
    }
  }

  // Live apply competes with nothing: it is rejected while another device
  // operation holds the lock rather than queued, because the caller sends a
  // fresh document moments later anyway.
  async applyConfiguration(
    json: string
  ): Promise<DeviceResult<DeviceConfigurationApplyResult>> {
    const active = this.getActiveDevice()
    if (!active.ok) return failure(active.error)
    const prepared = this.prepareConfiguration(json, active.value.session)
    if (!prepared.ok) return prepared
    this.deviceOperationActive = true
    try {
      await applyConfiguration(
        active.value.port,
        prepared.value.payload,
        this.operationTraffic(active.value.traffic)
      )
      return success({ configuration: prepared.value.configuration })
    } catch (error) {
      return failure(toDeviceError(error))
    } finally {
      this.deviceOperationActive = false
    }
  }

  async saveConfiguration(
    json: string
  ): Promise<DeviceResult<DeviceConfigurationSaveResult>> {
    const active = this.getActiveDevice()
    if (!active.ok) return failure(active.error)
    const prepared = this.prepareConfiguration(json, active.value.session)
    if (!prepared.ok) return prepared
    this.deviceOperationActive = true
    try {
      await saveConfiguration(
        active.value.port,
        prepared.value.payload,
        this.operationTraffic(active.value.traffic)
      )
      return success({
        configuration: prepared.value.configuration,
        rebootRequired: true
      })
    } catch (error) {
      return failure(toDeviceError(error))
    } finally {
      this.deviceOperationActive = false
    }
  }

  async resetConfiguration(): Promise<DeviceResult<DeviceConfigurationResetResult>> {
    const active = this.getActiveDevice()
    if (!active.ok) return failure(active.error)
    this.deviceOperationActive = true
    try {
      await resetConfiguration(active.value.port, this.operationTraffic(active.value.traffic))
      return success({
        configuration: { board: active.value.session.info.boardId },
        rebootRequired: true
      })
    } catch (error) {
      return failure(toDeviceError(error))
    } finally {
      this.deviceOperationActive = false
    }
  }

  async clearFonts(): Promise<DeviceResult<DeviceState>> {
    const active = this.getActiveDevice()
    if (!active.ok) return failure(active.error)
    const { port, session, traffic } = active.value
    if (!session.fontAssets) {
      return failure({
        code: 'not_simcore',
        message: 'The connected firmware does not support font asset management.'
      })
    }
    this.deviceOperationActive = true
    try {
      await clearFontAssets(port, this.operationTraffic(traffic))
      if (this.activePort !== port || this.state.session !== session) {
        throw new DeviceServiceError('serial_error', 'The connected device changed during font cleanup.')
      }
      this.setState({
        ...this.state,
        session: {
          ...session,
          fontAssets: {
            ...session.fontAssets,
            packageAvailable: false,
            formatVersion: 0,
            familyCount: 0,
            families: [],
            packageSize: 0,
            rebootRequired: true
          }
        }
      })
      return success(this.state)
    } catch (error) {
      return failure(toDeviceError(error))
    } finally {
      this.deviceOperationActive = false
    }
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
    signal: AbortSignal
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
      await uploadFontPackage(
        port,
        packageBytes,
        {
          onProgress,
          onTransmit: (data, encoding) => traffic?.write('tx', data, encoding)
        },
        signal
      )
      if (this.state.session === session && session.fontAssets) {
        const packageView = new DataView(
          packageBytes.buffer,
          packageBytes.byteOffset,
          packageBytes.byteLength
        )
        this.setState({
          ...this.state,
          session: {
            ...session,
            fontAssets: {
              ...session.fontAssets,
              packageAvailable: true,
              formatVersion: packageView.getUint16(4, true),
              familyCount: packageView.getUint16(12, true),
              families: readPackageFontFamilies(packageBytes),
              packageSize: packageBytes.byteLength,
              rebootRequired: true
            }
          }
        })
      }
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
  ): DeviceResult<{ configuration: DeviceConfiguration; payload: string }> {
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
    return this.deviceOperationActive ||
      ['scanning', 'connecting', 'disconnecting'].includes(this.state.status)
  }

  private setState(state: DeviceState): void {
    this.state = state
    this.onStateChanged(state)
  }
}

function readPackageFontFamilies(packageBytes: Uint8Array): string[] {
  const view = new DataView(packageBytes.buffer, packageBytes.byteOffset, packageBytes.byteLength)
  const count = view.getUint16(12, true)
  const decoder = new TextDecoder('ascii')
  return Array.from({ length: count }, (_, index) => {
    const offset = 32 + index * 48
    const familyBytes = packageBytes.subarray(offset, offset + 32)
    const terminator = familyBytes.indexOf(0)
    return decoder.decode(familyBytes.subarray(0, terminator < 0 ? 32 : terminator))
  })
}
