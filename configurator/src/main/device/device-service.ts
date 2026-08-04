import { randomUUID } from 'node:crypto'

import { SerialPort } from 'serialport'

import type { SerialTrafficLog } from '../../shared/development'
import {
  AUTOMATIC_BAUD_RATES,
  BOARD_PROFILES,
  CONFIGURATION_SCHEMA_VERSION,
  type DeviceConnection,
  type DeviceError,
  type DeviceErrorCode,
  type DeviceResult,
  type DeviceSession,
  type DeviceState,
  type DeviceInfo,
  type FontAssetDeviceInfo,
  type SerialPortSummary
} from '../../shared/device'
import type { FontUploadProgress } from '../../shared/font-assets'
import { parseDeviceConfigurationJson } from './configuration-json'
import { uploadFontPackage } from './font-upload'

interface PortRecord {
  path: string
  likelyUsb: boolean
  summary: SerialPortSummary
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

class DeviceServiceError extends Error {
  constructor(
    readonly code: DeviceErrorCode,
    message: string
  ) {
    super(message)
  }
}

const PROBE_TIMEOUT_MS = 1_000
const INFO_REQUEST = '@SC:INFO\n'
const GET_REQUEST = '@SC:GET\n'
const FONT_INFO_REQUEST = '@SC:FONT:INFO\n'

export class DeviceService {
  private readonly ports = new Map<string, PortRecord>()
  private readonly portIds = new Map<string, string>()
  private state: DeviceState = { status: 'disconnected' }
  private activePort: SerialPort | undefined
  private activeTraffic: SerialTrafficReporter | undefined
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

    const record = this.ports.get(portId)
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

  private async closeDevicePorts(): Promise<void> {
    ++this.operationToken
    this.setState({ status: 'disconnecting' })

    const pending = this.pendingPort
    const active = this.activePort
    const traffic = this.activeTraffic
    this.pendingPort = undefined
    this.activePort = undefined
    this.activeTraffic = undefined
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
        }
      )
      this.activePort = undefined
      this.activeTraffic = undefined
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
              assetCount: packageView.getUint16(12, true),
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
    const discovered = await SerialPort.list()
    const unique = new Map<string, (typeof discovered)[number]>()

    for (const port of discovered) {
      const key = serialIdentity(port.path)
      const current = unique.get(key)
      if (!current || prefersCalloutPath(port.path, current.path)) {
        unique.set(key, port)
      }
    }

    this.ports.clear()
    const records = [...unique.values()]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((port): PortRecord => {
        const identity = serialIdentity(port.path)
        const id = this.portIds.get(identity) ?? randomUUID()
        this.portIds.set(identity, id)
        const displayName = port.manufacturer
          ? `${port.manufacturer} — ${port.path}`
          : port.path
        const summary: SerialPortSummary = {
          id,
          path: port.path,
          displayName,
          ...(port.manufacturer ? { manufacturer: port.manufacturer } : {}),
          ...(port.vendorId ? { vendorId: port.vendorId } : {}),
          ...(port.productId ? { productId: port.productId } : {}),
          ...(port.serialNumber ? { serialNumber: port.serialNumber } : {})
        }
        const record = {
          path: port.path,
          likelyUsb: isLikelyUsbSerial(port.path, port.vendorId),
          summary
        }
        this.ports.set(id, record)
        return record
      })

    return records
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
    port.on('data', (chunk: Buffer) => {
      traffic.write('rx', chunk.toString('utf8'))
    })
    port.once('close', () => {
      if (this.activePort !== port) {
        return
      }
      this.activePort = undefined
      this.activeTraffic = undefined
      traffic.flush()
      this.setState({
        status: 'error',
        error: {
          code: 'serial_error',
          message: 'The serial device was disconnected.'
        }
      })
    })
    port.on('error', (error) => {
      if (this.activePort === port) {
        this.setState({ status: 'error', error: toDeviceError(error) })
      }
    })

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

class SerialTrafficReporter {
  private receiveBuffer = ''

  constructor(
    private readonly emit: ((log: SerialTrafficLog) => void) | undefined,
    private readonly path: string,
    private readonly baudRate: number
  ) {}

  write(
    direction: SerialTrafficLog['direction'],
    data: string,
    encoding: SerialTrafficLog['encoding'] = 'utf8'
  ): void {
    if (!this.emit) return
    if (direction === 'tx' || encoding === 'hex') {
      this.emit({ direction, path: this.path, baudRate: this.baudRate, data, encoding })
      return
    }

    this.receiveBuffer += data
    const lines = this.receiveBuffer.replaceAll('\r', '').split('\n')
    this.receiveBuffer = lines.pop() ?? ''
    for (const line of lines) {
      this.emit({ direction, path: this.path, baudRate: this.baudRate, data: line, encoding })
    }
  }

  flush(): void {
    if (!this.emit || this.receiveBuffer.length === 0) return
    this.emit({
      direction: 'rx',
      path: this.path,
      baudRate: this.baudRate,
      data: this.receiveBuffer,
      encoding: 'utf8'
    })
    this.receiveBuffer = ''
  }
}

function openPort(port: SerialPort): Promise<void> {
  return new Promise((resolve, reject) => {
    port.open((error) => (error ? reject(error) : resolve()))
  })
}

function closePort(port: SerialPort | undefined): Promise<void> {
  if (!port?.isOpen) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    port.close(() => resolve())
  })
}

async function probeSimCore(
  port: SerialPort,
  onTraffic: (direction: SerialTrafficLog['direction'], data: string) => void
): Promise<DeviceSession> {
  const infoLine = await requestResponse(
    port,
    INFO_REQUEST,
    '@SC:OK:INFO:',
    PROBE_TIMEOUT_MS,
    onTraffic
  )
  const info = parseDeviceInfo(infoLine)
  const configurationLine = await requestResponse(
    port,
    GET_REQUEST,
    '@SC:OK:CONFIG:',
    1_500,
    onTraffic
  )
  let configuration: DeviceSession['configuration']
  try {
    configuration = parseDeviceConfigurationJson(
      configurationLine.slice('@SC:OK:CONFIG:'.length)
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown configuration error.'
    throw new DeviceServiceError('not_simcore', message)
  }
  if (configuration.board !== info.boardId) {
    throw new DeviceServiceError(
      'not_simcore',
      'The device configuration board does not match the connected hardware.'
    )
  }
  const fontAssets = await probeFontAssets(port, onTraffic)
  return { info, configuration, ...(fontAssets ? { fontAssets } : {}) }
}

async function probeFontAssets(
  port: SerialPort,
  onTraffic: (direction: SerialTrafficLog['direction'], data: string) => void
): Promise<FontAssetDeviceInfo | undefined> {
  try {
    const line = await requestResponse(
      port,
      FONT_INFO_REQUEST,
      '@SC:OK:FONT:INFO:',
      PROBE_TIMEOUT_MS,
      onTraffic
    )
    return parseFontAssetInfo(line)
  } catch (error) {
    if (
      error instanceof DeviceServiceError &&
      error.code === 'not_simcore' &&
      error.message.includes('unknown_command')
    ) {
      return undefined
    }
    throw error
  }
}

function requestResponse(
  port: SerialPort,
  request: string,
  responsePrefix: string,
  timeoutMs: number,
  onTraffic: (direction: SerialTrafficLog['direction'], data: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    let settled = false
    const timers: {
      retry?: NodeJS.Timeout
      timeout?: NodeJS.Timeout
    } = {}

    const cleanup = (): void => {
      if (timers.timeout) {
        clearTimeout(timers.timeout)
      }
      if (timers.retry) {
        clearInterval(timers.retry)
      }
      port.off('data', onData)
      port.off('error', onError)
      port.off('close', onClose)
    }
    const finish = (error?: Error, response?: string): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      if (error) {
        reject(error)
      } else {
        resolve(response ?? '')
      }
    }
    const onData = (chunk: Buffer): void => {
      onTraffic('rx', chunk.toString('utf8'))
      buffer = (buffer + chunk.toString('utf8')).slice(-8_192)
      const lines = buffer.replaceAll('\r', '').split('\n')
      buffer = lines.pop() ?? ''
      const response = lines.find((line) => line.startsWith(responsePrefix))
      if (response) {
        finish(undefined, response)
        return
      }
      const deviceError = lines.find((line) => line.startsWith('@SC:ERR:'))
      if (deviceError) {
        finish(new DeviceServiceError('not_simcore', `SimCore rejected the request: ${deviceError}`))
      }
    }
    const onError = (error: Error): void => finish(error)
    const onClose = (): void => {
      finish(new DeviceServiceError('serial_error', 'Serial port closed during probe.'))
    }
    const sendRequest = (): void => {
      if (port.isOpen) {
        port.write(request, (error) => {
          if (error) {
            finish(error)
          } else {
            onTraffic('tx', request)
          }
        })
      }
    }

    port.on('data', onData)
    port.once('error', onError)
    port.once('close', onClose)
    timers.retry = setInterval(sendRequest, 350)
    timers.timeout = setTimeout(() => {
      finish(new DeviceServiceError('not_simcore', `The device did not answer ${request.trim()}.`))
    }, timeoutMs)
    port.flush(() => sendRequest())
  })
}

function parseDeviceInfo(line: string): DeviceInfo {
  const fields = new Map<string, string>()
  for (const entry of line.slice('@SC:OK:INFO:'.length).split(',')) {
    const separator = entry.indexOf('=')
    if (separator <= 0) {
      throw new DeviceServiceError('not_simcore', 'The device returned malformed INFO data.')
    }
    fields.set(entry.slice(0, separator), entry.slice(separator + 1))
  }
  const board = fields.get('board')
  if (board !== 't_display_s3' && board !== 'guition_esp32_4848s040') {
    throw new DeviceServiceError('not_simcore', `Unsupported SimCore board: ${board ?? 'unknown'}.`)
  }
  if (fields.get('schema') !== String(CONFIGURATION_SCHEMA_VERSION)) {
    throw new DeviceServiceError(
      'not_simcore',
      `Unsupported configuration schema: ${fields.get('schema') ?? 'unknown'}.`
    )
  }
  const source = fields.get('source')
  const generation = Number(fields.get('generation'))
  const firmwareVersion = fields.get('firmware')
  if (
    !firmwareVersion ||
    (source !== 'factory' && source !== 'slot_a' && source !== 'slot_b') ||
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    (fields.get('storage') !== '0' && fields.get('storage') !== '1')
  ) {
    throw new DeviceServiceError('not_simcore', 'The device returned malformed INFO data.')
  }
  return {
    boardId: board,
    firmwareVersion,
    schemaVersion: CONFIGURATION_SCHEMA_VERSION,
    display: BOARD_PROFILES[board].display,
    configurationSource: source,
    generation,
    storageAvailable: fields.get('storage') === '1'
  }
}

function parseFontAssetInfo(line: string): FontAssetDeviceInfo {
  const fields = new Map<string, string>()
  for (const entry of line.slice('@SC:OK:FONT:INFO:'.length).split(',')) {
    const separator = entry.indexOf('=')
    if (separator <= 0) {
      throw new DeviceServiceError('not_simcore', 'The device returned malformed font status.')
    }
    fields.set(entry.slice(0, separator), entry.slice(separator + 1))
  }
  const formatVersion = Number(fields.get('format'))
  const assetCount = Number(fields.get('assets'))
  const packageSize = Number(fields.get('size'))
  const packageAvailable = fields.get('package') === '1'
  if (
    (fields.get('storage') !== '0' && fields.get('storage') !== '1') ||
    (fields.get('package') !== '0' && fields.get('package') !== '1') ||
    !Number.isSafeInteger(formatVersion) || formatVersion < 0 || formatVersion > 0xffff ||
    !Number.isSafeInteger(assetCount) || assetCount < 0 || assetCount > 32 ||
    !Number.isSafeInteger(packageSize) || packageSize < 0 || packageSize > 2 * 1024 * 1024 ||
    (packageAvailable
      ? formatVersion !== 2 || packageSize < 4096
      : formatVersion !== 0 || assetCount !== 0 || packageSize !== 0) ||
    (fields.get('reboot_required') !== '0' && fields.get('reboot_required') !== '1')
  ) {
    throw new DeviceServiceError('not_simcore', 'The device returned malformed font status.')
  }
  return {
    storageAvailable: fields.get('storage') === '1',
    packageAvailable,
    formatVersion,
    assetCount,
    packageSize,
    rebootRequired: fields.get('reboot_required') === '1'
  }
}

function serialIdentity(path: string): string {
  return path
    .replace(/^\/dev\/cu\./, '/dev/serial.')
    .replace(/^\/dev\/tty\./, '/dev/serial.')
}

function prefersCalloutPath(candidate: string, current: string): boolean {
  return candidate.startsWith('/dev/cu.') && current.startsWith('/dev/tty.')
}

function isBluetoothPort(path: string): boolean {
  return path.toLowerCase().includes('bluetooth')
}

function isLikelyUsbSerial(path: string, vendorId?: string): boolean {
  const name = path.toLowerCase()
  return Boolean(vendorId) || /usb|ttyacm|ttyusb|wch|slab/.test(name) || /^com\d+$/i.test(path)
}

function success<T>(value: T): DeviceResult<T> {
  return { ok: true, value }
}

function failure<T>(error: DeviceError): DeviceResult<T> {
  return { ok: false, error }
}

function toDeviceError(error: unknown): DeviceError {
  if (error instanceof DeviceServiceError) {
    return { code: error.code, message: error.message }
  }

  const message = error instanceof Error ? error.message : 'Unknown serial error.'
  const normalized = message.toLowerCase()
  if (normalized.includes('resource busy') || normalized.includes('cannot lock')) {
    return { code: 'port_busy', message: 'The serial port is busy. Close SimHub or a serial monitor.' }
  }
  if (normalized.includes('permission denied') || normalized.includes('access denied')) {
    return { code: 'permission_denied', message: 'Permission to open the serial port was denied.' }
  }
  if (normalized.includes('no such file') || normalized.includes('cannot find')) {
    return { code: 'port_missing', message: 'The serial port is no longer available.' }
  }
  return { code: 'serial_error', message }
}
