import { performance } from 'node:perf_hooks'

import {
  SNAPSHOT_INTERVAL_MS,
  SOURCE_IDLE_MS,
  idleBridgeStatus,
  type TelemetryBridgeStartRequest,
  type TelemetryBridgeStatus,
  type TelemetrySnapshot
} from '@shared/telemetry-bridge'
import type { DeviceError, DeviceResult } from '@shared/device'
import { t } from '@shared/ui-text'
import { failure, success, toDeviceError } from '../device/device-errors'
import type { DeviceService } from '../device/device-service'
import { BridgeMetrics } from './bridge-metrics'
import { openPluginListener, type LinkPacket, type PluginListener } from './plugin-listener'
import { TelemetryTap } from './telemetry-tap'

const STATUS_INTERVAL_MS = 500
const MAXIMUM_PENDING_WRITES = 3

export class TelemetryBridgeService {
  private readonly tap = new TelemetryTap()
  private readonly metrics = new BridgeMetrics()
  private listener: PluginListener | undefined
  private snapshotTimer: NodeJS.Timeout | undefined
  private statusTimer: NodeJS.Timeout | undefined
  private sourceAddress: string | undefined
  private lastPacketAt = Number.NEGATIVE_INFINITY
  private pendingWrites = 0
  private error: string | undefined

  constructor(
    private readonly deviceService: DeviceService,
    private readonly onStatus: (status: TelemetryBridgeStatus) => void,
    private readonly onSnapshot: (snapshot: TelemetrySnapshot) => void
  ) {}

  getStatus(): TelemetryBridgeStatus {
    const status = idleBridgeStatus()
    if (!this.listener) {
      return this.error === undefined ? status : { ...status, error: this.error }
    }
    return {
      ...status,
      running: true,
      receiving: performance.now() - this.lastPacketAt < SOURCE_IDLE_MS,
      port: this.listener.port,
      simhubAddress: this.listener.simhubAddress,
      relaying: this.deviceService.relayAvailable(),
      suspended:
        this.deviceService.telemetryLinkAvailable() && !this.deviceService.relayAvailable(),
      metrics: this.metrics.snapshot(),
      ...(this.sourceAddress === undefined ? {} : { sourceAddress: this.sourceAddress }),
      ...(this.error === undefined ? {} : { error: this.error })
    }
  }

  async start(request: TelemetryBridgeStartRequest): Promise<DeviceResult<TelemetryBridgeStatus>> {
    if (this.listener) {
      return failure({ code: 'busy', message: t('telemetry.bridgeService.alreadyRunning') })
    }
    try {
      this.listener = await openPluginListener({
        port: request.port,
        simhubHost: request.simhubHost,
        simhubPort: request.simhubPort
      })
      this.sourceAddress = undefined
      this.lastPacketAt = Number.NEGATIVE_INFINITY
      this.error = undefined
      this.pendingWrites = 0
      this.tap.reset()
      this.metrics.reset()
      this.listener.onPacket(this.receive)
      this.listener.onClose(this.closed)
      this.snapshotTimer = setInterval(this.publishSnapshot, SNAPSHOT_INTERVAL_MS)
      this.statusTimer = setInterval(this.publishStatus, STATUS_INTERVAL_MS)
      return success(this.publishStatus())
    } catch (error) {
      await this.stop()
      return failure(listenFailure(error, request.port))
    }
  }

  async stop(): Promise<DeviceResult<TelemetryBridgeStatus>> {
    const listener = this.listener
    this.listener = undefined
    this.sourceAddress = undefined
    if (this.snapshotTimer) clearInterval(this.snapshotTimer)
    if (this.statusTimer) clearInterval(this.statusTimer)
    this.snapshotTimer = undefined
    this.statusTimer = undefined
    await listener?.close()
    this.tap.reset()
    this.publishSnapshot()
    return success(this.publishStatus())
  }

  async dispose(): Promise<void> {
    if (this.listener) await this.stop()
  }

  private readonly receive = (packet: LinkPacket): void => {
    this.sourceAddress = packet.address
    this.lastPacketAt = packet.at
    this.metrics.recordPacket(packet.at, packet.payload.length, packet.lost, packet.discarded)
    this.relay(packet)
    const counts = this.tap.consume(packet.payload.toString('utf8'))
    this.metrics.recordDecoded(packet.at, counts.lines, counts.fields, counts.unknown)
  }

  private relay(packet: LinkPacket): void {
    if (!this.deviceService.relayAvailable()) {
      if (this.deviceService.telemetryLinkAvailable()) {
        this.metrics.recordDropped(packet.payload.length)
      }
      return
    }
    if (this.pendingWrites >= MAXIMUM_PENDING_WRITES) {
      this.metrics.recordDropped(packet.payload.length)
      return
    }
    this.pendingWrites += 1
    this.metrics.recordHandoff(performance.now() - packet.at)
    this.deviceService.writeTelemetry(packet.payload, (error) => {
      this.pendingWrites = Math.max(0, this.pendingWrites - 1)
      if (error) this.metrics.recordWriteError()
      else this.metrics.recordDrain(performance.now() - packet.at)
    })
  }

  private readonly closed = (error?: Error): void => {
    if (!this.listener) return
    this.error = error ? toDeviceError(error).message : t('telemetry.bridgeService.sourceClosed')
    void this.stop()
  }

  private readonly publishSnapshot = (): void => {
    if (!this.tap.dirty) return
    this.onSnapshot(this.tap.snapshot())
  }

  private readonly publishStatus = (): TelemetryBridgeStatus => {
    const status = this.getStatus()
    this.onStatus(status)
    return status
  }
}

function listenFailure(error: unknown, port: number): DeviceError {
  const failed = toDeviceError(error)
  if ((error as NodeJS.ErrnoException | undefined)?.code !== 'EADDRINUSE') return failed
  return {
    code: 'busy',
    message: t('telemetry.bridgeService.portInUse', { port: String(port) })
  }
}
