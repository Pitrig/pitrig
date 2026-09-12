import { StringDecoder } from 'node:string_decoder'

import { SerialPort } from 'serialport'

import type { SerialTrafficLog } from '../../shared/serial-traffic'
import type {
  DeviceConnection,
  DeviceError,
  DeviceResult,
  DeviceSession,
  DeviceState,
  SerialPortSummary
} from '../../shared/device'
import { DeviceServiceError, failure, success, toDeviceError } from './device-errors'
import { PortRegistry, type PortRecord } from './port-registry'
import { closePort, openPort } from './serial-port-lifecycle'
import { SerialTrafficReporter } from './serial-traffic-reporter'
import { identifyPitrig, probePitrig } from './device-probe'
import { reconnectToBoard, scanForDevice } from './device-scan'
import type { TrafficCallback } from './serial-request'
import { t } from '@shared/ui-text'

export interface OpenedDevice {
  port: SerialPort
  session: DeviceSession
  traffic: SerialTrafficReporter
}

export class ConnectionManager {
  private readonly portRegistry = new PortRegistry()
  private state: DeviceState = { status: 'disconnected' }
  private activePort: SerialPort | undefined
  private activeTraffic: SerialTrafficReporter | undefined
  private detachActiveListeners: (() => void) | undefined
  private pendingPort: SerialPort | undefined
  private operationToken = 0

  constructor(
    private readonly onStateChanged: (state: DeviceState) => void,
    private readonly onSerialTraffic?: (log: SerialTrafficLog) => void
  ) {}

  getState(): DeviceState {
    return this.state
  }

  setState(state: DeviceState): void {
    this.state = state
    this.onStateChanged(state)
  }

  get port(): SerialPort | undefined {
    return this.activePort
  }

  get traffic(): SerialTrafficReporter | undefined {
    return this.activeTraffic
  }

  isTransitioning(): boolean {
    return ['scanning', 'connecting', 'disconnecting'].includes(this.state.status)
  }

  async listPorts(): Promise<DeviceResult<SerialPortSummary[]>> {
    try {
      const records = await this.refreshPortRegistry()
      return success(records.map(({ summary }) => summary))
    } catch (error) {
      return failure(toDeviceError(error))
    }
  }

  async refreshPortRegistry(): Promise<PortRecord[]> {
    return this.portRegistry.refresh()
  }

  async openConnection(
    portId: string,
    baudRate: number,
    quiet = false
  ): Promise<DeviceResult<DeviceState>> {
    return this.openWithToken(portId, baudRate, quiet, this.startOperation())
  }

  startOperation(): number {
    return ++this.operationToken
  }

  async openWithToken(
    portId: string,
    baudRate: number,
    quiet: boolean,
    token: number
  ): Promise<DeviceResult<DeviceState>> {
    if (this.activePort?.isOpen) {
      return failure({ code: 'busy', message: t('device.deviceConnection.aDeviceIsAlreadyConnected') })
    }

    const record = this.portRegistry.get(portId)
    if (!record) {
      const error: DeviceError = {
        code: 'port_missing',
        message: t('device.deviceConnection.theSelectedSerialPortIs')
      }
      if (!quiet) this.setState({ status: 'error', error })
      return failure(error)
    }

    this.setState({ status: 'connecting' })
    try {
      const opened = await this.openAndProbe(record, baudRate, token)
      this.attachActivePort(opened, record, baudRate)
      return success(this.state)
    } catch (error) {
      if (quiet) return failure(toDeviceError(error))
      return this.finishFailedOperation(error, token)
    }
  }

  async autoConnect(): Promise<DeviceResult<DeviceState>> {
    if (this.activePort?.isOpen) {
      return failure({ code: 'busy', message: t('device.deviceConnection.aDeviceIsAlreadyConnected') })
    }

    const token = ++this.operationToken
    this.setState({ status: 'scanning' })
    try {
      const match = await scanForDevice(this, token)
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

  async closeDevicePorts(): Promise<void> {
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

  releaseActivePort(): { port: SerialPort; traffic?: SerialTrafficReporter } | undefined {
    const port = this.activePort
    if (!port) return undefined
    const traffic = this.activeTraffic
    this.activePort = undefined
    this.activeTraffic = undefined
    this.detachActiveListeners?.()
    this.detachActiveListeners = undefined
    return { port, traffic }
  }

  async reconnect(connection: DeviceConnection): Promise<DeviceResult<DeviceState>> {
    return reconnectToBoard(this, connection)
  }

  async openAndProbe(record: PortRecord, baudRate: number, token: number): Promise<OpenedDevice> {
    const opened = await this.openPortFor(record, baudRate, token, probePitrig)
    return { port: opened.port, session: opened.value, traffic: opened.traffic }
  }

  async openAndIdentify(
    record: PortRecord,
    baudRate: number,
    token: number
  ): Promise<{ port: SerialPort; traffic: SerialTrafficReporter }> {
    const opened = await this.openPortFor(record, baudRate, token, identifyPitrig)
    return { port: opened.port, traffic: opened.traffic }
  }

  private async openPortFor<T>(
    record: PortRecord,
    baudRate: number,
    token: number,
    probe: (port: SerialPort, onTraffic: TrafficCallback) => Promise<T>
  ): Promise<{ port: SerialPort; traffic: SerialTrafficReporter; value: T }> {
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
      const value = await probe(port, (direction, data) => traffic.write(direction, data))
      this.ensureCurrent(token)
      this.pendingPort = undefined
      return { port, traffic, value }
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
    const decoder = new StringDecoder('utf8')
    const onData = (chunk: Buffer): void => {
      const text = decoder.write(chunk)
      if (text.length > 0) traffic.write('rx', text)
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
          message: t('device.deviceConnection.theSerialDeviceWasDisconnected')
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

  ensureCurrent(token: number): void {
    if (token !== this.operationToken) {
      throw new DeviceServiceError('cancelled', t('device.deviceConnection.deviceScanWasCancelled'))
    }
  }
}
