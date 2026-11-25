import type { SerialPort } from 'serialport'

import type { SerialTrafficLog } from '../../shared/serial-traffic'
import type {
  DeviceActivity,
  DeviceConnection,
  DeviceError,
  DeviceResult,
  DeviceSession,
  DeviceState,
  SerialPortSummary
} from '../../shared/device'
import { listenToActivePort } from './active-port-listeners'
import { DeviceServiceError, failure, success, toDeviceError } from './device-errors'
import { PortLeases } from './port-leases'
import { openPortFor, type PortOpening } from './port-opening'
import { PortRegistry, type PortRecord } from './port-registry'
import { closePort } from './serial-port-lifecycle'
import type { SerialTrafficReporter } from './serial-traffic-reporter'
import { identifyPitrig, probePitrig } from './device-probe'
import { reconnectToBoard, scanForDevice } from './device-scan'
import { t } from '@shared/ui-text'

export interface OpenedDevice {
  port: SerialPort
  session: DeviceSession
  traffic: SerialTrafficReporter
}

export class ConnectionManager {
  readonly leases = new PortLeases()
  private readonly portRegistry = new PortRegistry()
  private state: DeviceState = { status: 'disconnected' }
  private activePort: SerialPort | undefined
  private activeTraffic: SerialTrafficReporter | undefined
  private detachActiveListeners: (() => void) | undefined
  private pendingPort: SerialPort | undefined
  private operationToken = 0
  private activity: DeviceActivity | undefined
  private readonly opening: PortOpening

  constructor(
    private readonly onStateChanged: (state: DeviceState) => void,
    onSerialTraffic?: (log: SerialTrafficLog) => void
  ) {
    this.opening = {
      leases: this.leases,
      onSerialTraffic,
      ensureCurrent: (token) => this.ensureCurrent(token),
      holdPending: (port) => {
        this.pendingPort = port
      },
      pending: () => this.pendingPort
    }
  }

  getState(): DeviceState {
    return this.state
  }

  setState(state: DeviceState): void {
    this.state = withActivity(state, this.activity)
    this.onStateChanged(this.state)
  }

  setActivity(activity: DeviceActivity | undefined): void {
    if (this.activity === activity) return
    this.activity = activity
    this.setState(this.state)
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
    token: number,
    holdUntil?: number
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
      const opened = await this.openAndProbe(record, baudRate, token, holdUntil)
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
    this.leases.dropAll()
    this.setState({ status: 'disconnected' })
    return success(this.state)
  }

  async closeDevicePorts(): Promise<void> {
    ++this.operationToken
    const connection = this.state.connection
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
    this.leases.handBack(connection?.path, connection?.baudRate)
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

  async openAndProbe(
    record: PortRecord,
    baudRate: number,
    token: number,
    holdUntil?: number
  ): Promise<OpenedDevice> {
    const opened = await openPortFor(this.opening, record, baudRate, token, probePitrig, holdUntil)
    return { port: opened.port, session: opened.value, traffic: opened.traffic }
  }

  async openAndIdentify(
    record: PortRecord,
    baudRate: number,
    token: number
  ): Promise<{ port: SerialPort; traffic: SerialTrafficReporter }> {
    const opened = await openPortFor(this.opening, record, baudRate, token, identifyPitrig)
    return { port: opened.port, traffic: opened.traffic }
  }

  private attachActivePort(opened: OpenedDevice, record: PortRecord, baudRate: number): void {
    const { port, session, traffic } = opened
    this.leases.keepOnly(record.path)
    this.activePort = port
    this.activeTraffic = traffic
    this.detachActiveListeners = listenToActivePort(port, traffic, {
      onClose: () => {
        if (this.activePort !== port) {
          return
        }
        this.activePort = undefined
        this.activeTraffic = undefined
        this.detachActiveListeners?.()
        this.detachActiveListeners = undefined
        traffic.flush()
        this.leases.dropAll()
        this.setState({
          status: 'error',
          error: {
            code: 'serial_error',
            message: t('device.deviceConnection.theSerialDeviceWasDisconnected')
          }
        })
      },
      onError: (error) => {
        if (this.activePort === port) {
          this.setState({ status: 'error', error: toDeviceError(error) })
        }
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
      this.leases.dropAll()
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

function withActivity(state: DeviceState, activity: DeviceActivity | undefined): DeviceState {
  if (state.activity === activity) return state
  const next = { ...state }
  if (activity === undefined) delete next.activity
  else next.activity = activity
  return next
}
