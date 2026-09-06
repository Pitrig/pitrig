import { performance } from 'node:perf_hooks'

import {
  SNAPSHOT_INTERVAL_MS,
  idleBridgeStatus,
  type TelemetryBridgeStartRequest,
  type TelemetryBridgeStatus,
  type TelemetrySnapshot
} from '@shared/telemetry-bridge'
import type { DeviceResult } from '@shared/device'
import { t } from '@shared/ui-text'
import { failure, success, toDeviceError } from '../device/device-errors'
import type { DeviceService } from '../device/device-service'
import { BridgeMetrics } from './bridge-metrics'
import { openPortSource, type BridgeSource } from './bridge-source'
import { hostingSupported, openHostedSource } from './pty-host'
import { TelemetryTap } from './telemetry-tap'

const NEWLINE = 10
const STATUS_INTERVAL_MS = 500
const MAXIMUM_PENDING_WRITES = 3

export class TelemetryBridgeService {
  private readonly tap = new TelemetryTap()
  private readonly metrics = new BridgeMetrics()
  private source: BridgeSource | undefined
  private snapshotTimer: NodeJS.Timeout | undefined
  private statusTimer: NodeJS.Timeout | undefined
  private mode: TelemetryBridgeStartRequest['mode'] | undefined
  private resyncing = false
  private pendingWrites = 0
  private error: string | undefined

  constructor(
    private readonly deviceService: DeviceService,
    private readonly onStatus: (status: TelemetryBridgeStatus) => void,
    private readonly onSnapshot: (snapshot: TelemetrySnapshot) => void
  ) {}

  getStatus(): TelemetryBridgeStatus {
    const status = idleBridgeStatus(hostingSupported())
    if (!this.source) {
      return this.error === undefined ? status : { ...status, error: this.error }
    }
    return {
      ...status,
      running: true,
      mode: this.mode,
      listenPath: this.source.path,
      relaying: this.deviceService.relayAvailable(),
      suspended:
        this.deviceService.telemetryLinkAvailable() && !this.deviceService.relayAvailable(),
      metrics: this.metrics.snapshot(),
      ...(this.source.baudRate === undefined ? {} : { baudRate: this.source.baudRate }),
      ...(this.error === undefined ? {} : { error: this.error })
    }
  }

  async start(request: TelemetryBridgeStartRequest): Promise<DeviceResult<TelemetryBridgeStatus>> {
    if (this.source) {
      return failure({ code: 'busy', message: t('telemetry.bridgeService.alreadyRunning') })
    }
    try {
      const source = await this.openSource(request)
      if (!source.ok) return failure(source.error)
      this.source = source.value
      this.mode = request.mode
      this.error = undefined
      this.resyncing = false
      this.pendingWrites = 0
      this.tap.reset()
      this.metrics.reset()
      this.source.onData(this.receive)
      this.source.onClose(this.closed)
      this.snapshotTimer = setInterval(this.publishSnapshot, SNAPSHOT_INTERVAL_MS)
      this.statusTimer = setInterval(this.publishStatus, STATUS_INTERVAL_MS)
      return success(this.publishStatus())
    } catch (error) {
      await this.stop()
      return failure(toDeviceError(error))
    }
  }

  async stop(): Promise<DeviceResult<TelemetryBridgeStatus>> {
    const source = this.source
    this.source = undefined
    this.mode = undefined
    if (this.snapshotTimer) clearInterval(this.snapshotTimer)
    if (this.statusTimer) clearInterval(this.statusTimer)
    this.snapshotTimer = undefined
    this.statusTimer = undefined
    await source?.close()
    this.tap.reset()
    this.publishSnapshot()
    return success(this.publishStatus())
  }

  async dispose(): Promise<void> {
    if (this.source) await this.stop()
  }

  private async openSource(
    request: TelemetryBridgeStartRequest
  ): Promise<DeviceResult<BridgeSource>> {
    if (request.mode === 'hosted') {
      if (!hostingSupported()) {
        return failure({ code: 'invalid_request', message: t('telemetry.bridgeService.hostingUnsupported') })
      }
      return success(await openHostedSource())
    }
    if (!request.portId) {
      return failure({ code: 'invalid_request', message: t('telemetry.bridgeService.noPortChosen') })
    }
    const record = await this.deviceService.findPort(request.portId)
    if (!record) {
      return failure({ code: 'port_missing', message: t('telemetry.bridgeService.portMissing') })
    }
    if (record.path === this.deviceService.getState().connection?.path) {
      return failure({ code: 'invalid_request', message: t('telemetry.bridgeService.portIsTheBoard') })
    }
    return success(await openPortSource(record, request.baudRate ?? 115_200))
  }

  private readonly receive = (chunk: Buffer): void => {
    const at = performance.now()
    this.metrics.recordChunk(at, chunk.length)
    this.relay(chunk, at)
    const counts = this.tap.consume(chunk.toString('utf8'))
    this.metrics.recordDecoded(at, counts.lines, counts.fields, counts.unknown)
  }

  private relay(chunk: Buffer, at: number): void {
    if (!this.deviceService.relayAvailable()) {
      this.resyncing = true
      if (this.deviceService.telemetryLinkAvailable()) this.metrics.recordDropped(chunk.length)
      return
    }
    if (this.pendingWrites >= MAXIMUM_PENDING_WRITES) {
      this.resyncing = true
      this.metrics.recordDropped(chunk.length)
      return
    }
    let payload = chunk
    if (this.resyncing) {
      const boundary = chunk.indexOf(NEWLINE)
      if (boundary < 0) {
        this.metrics.recordDropped(chunk.length)
        return
      }
      this.metrics.recordDropped(boundary + 1)
      this.resyncing = false
      payload = chunk.subarray(boundary + 1)
      if (payload.length === 0) return
    }
    this.pendingWrites += 1
    this.metrics.recordHandoff(performance.now() - at)
    this.deviceService.writeTelemetry(payload, (error) => {
      this.pendingWrites = Math.max(0, this.pendingWrites - 1)
      if (error) this.metrics.recordWriteError()
      else this.metrics.recordDrain(performance.now() - at)
    })
  }

  private readonly closed = (error?: Error): void => {
    if (!this.source) return
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
