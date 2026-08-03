import { randomUUID } from 'node:crypto'

import { SerialPort } from 'serialport'

import {
  AUTOMATIC_BAUD_RATES,
  type DeviceConnection,
  type DeviceError,
  type DeviceErrorCode,
  type DeviceResult,
  type DeviceState,
  type SerialPortSummary
} from '../../shared/device'

interface PortRecord {
  path: string
  likelyUsb: boolean
  summary: SerialPortSummary
}

interface Match {
  record: PortRecord
  baudRate: number
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

export class DeviceService {
  private readonly ports = new Map<string, PortRecord>()
  private readonly portIds = new Map<string, string>()
  private state: DeviceState = { status: 'disconnected' }
  private activePort: SerialPort | undefined
  private pendingPort: SerialPort | undefined
  private operationToken = 0

  constructor(private readonly onStateChanged: (state: DeviceState) => void) {}

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
      return failure({
        code: 'port_missing',
        message: 'The selected serial port is no longer available. Refresh the port list.'
      })
    }

    const token = ++this.operationToken
    this.setState({ status: 'connecting' })
    try {
      const port = await this.openAndProbe(record, baudRate, token)
      this.attachActivePort(port, record, baudRate)
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
      const usable = records.filter(({ path }) => !isBluetoothPort(path))
      const usb = usable.filter(({ likelyUsb }) => likelyUsb)
      const candidates = usb.length > 0 ? usb : usable
      if (candidates.length === 0) {
        throw new DeviceServiceError('no_device', 'No serial ports were found.')
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
            const port = await this.openAndProbe(record, baudRate, token)
            await closePort(port)
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
      const port = await this.openAndProbe(match.record, match.baudRate, token)
      this.attachActivePort(port, match.record, match.baudRate)
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
    ++this.operationToken
    this.setState({ status: 'disconnecting' })

    const pending = this.pendingPort
    const active = this.activePort
    this.pendingPort = undefined
    this.activePort = undefined
    await Promise.all([closePort(pending), closePort(active)])
    this.setState({ status: 'disconnected' })
    return success(this.state)
  }

  async dispose(): Promise<void> {
    await this.disconnect()
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
  ): Promise<SerialPort> {
    this.ensureCurrent(token)
    const port = new SerialPort({
      path: record.path,
      baudRate,
      autoOpen: false,
      lock: true
    })
    this.pendingPort = port

    try {
      await openPort(port)
      this.ensureCurrent(token)
      await probeSimCore(port)
      this.ensureCurrent(token)
      this.pendingPort = undefined
      return port
    } catch (error) {
      if (this.pendingPort === port) {
        this.pendingPort = undefined
      }
      await closePort(port)
      throw error
    }
  }

  private attachActivePort(port: SerialPort, record: PortRecord, baudRate: number): void {
    this.activePort = port
    port.on('data', discardData)
    port.once('close', () => {
      if (this.activePort !== port) {
        return
      }
      this.activePort = undefined
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
    this.setState({ status: 'connected', connection })
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
    return ['scanning', 'connecting', 'disconnecting'].includes(this.state.status)
  }

  private setState(state: DeviceState): void {
    this.state = state
    this.onStateChanged(state)
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

function probeSimCore(port: SerialPort): Promise<void> {
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
    const finish = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const onData = (chunk: Buffer): void => {
      buffer = (buffer + chunk.toString('utf8')).slice(-8_192)
      const lines = buffer.replaceAll('\r', '').split('\n')
      buffer = lines.pop() ?? ''
      if (lines.some((line) => line.startsWith('@SC:OK:INFO:'))) {
        finish()
      }
    }
    const onError = (error: Error): void => finish(error)
    const onClose = (): void => {
      finish(new DeviceServiceError('serial_error', 'Serial port closed during probe.'))
    }
    const sendProbe = (): void => {
      if (port.isOpen) {
        port.write(INFO_REQUEST, (error) => {
          if (error) {
            finish(error)
          }
        })
      }
    }

    port.on('data', onData)
    port.once('error', onError)
    port.once('close', onClose)
    timers.retry = setInterval(sendProbe, 350)
    timers.timeout = setTimeout(() => {
      finish(new DeviceServiceError('not_simcore', 'The device did not answer the SimCore INFO probe.'))
    }, PROBE_TIMEOUT_MS)
    port.flush(() => sendProbe())
  })
}

function discardData(): void {}

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
