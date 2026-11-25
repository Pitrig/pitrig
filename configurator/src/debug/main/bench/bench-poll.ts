import { performance } from 'node:perf_hooks'

import type { BenchDiagnosticsSupport, BenchSample } from '@debug-shared/bench'
import type { DeviceService } from '@main/device/device-service'
import { isDiagnosticsReply, parseBenchDiagnostics } from './bench-diagnostics'
import type { TelemetryFeed } from './telemetry-feed'
import { CONTROL_PREFIX } from '@shared/control-protocol'

const DIAGNOSTICS_COMMAND = `${CONTROL_PREFIX}DIAG`
const PRODUCT_BUILD_REPLY = `${CONTROL_PREFIX}ERR:unsupported`
const PRODUCT_BUILD = 'This board runs a product build; flash a debug build for diagnostics.'

export interface BenchPollHost {
  deviceService: DeviceService
  feed: TelemetryFeed
  onSample: (sample: BenchSample) => void
  onNotice: (message: string) => void
  onSupportChanged: () => void
  onLinkLost: () => void
}

export class BenchPoller {
  private timer: NodeJS.Timeout | undefined
  private sampling = false
  private support: BenchDiagnosticsSupport = 'unknown'

  constructor(private readonly host: BenchPollHost) {}

  get active(): boolean {
    return this.timer !== undefined
  }

  get diagnostics(): BenchDiagnosticsSupport {
    return this.support
  }

  start(intervalMs: number): void {
    this.stop()
    this.timer = setInterval(this.tick, intervalMs)
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  forgetSupport(): void {
    this.support = 'unknown'
  }

  private readonly tick = (): void => {
    if (this.sampling) return
    void this.sample()
  }

  private async sample(): Promise<void> {
    const { deviceService, feed } = this.host
    const busy = deviceService.getState().activity !== undefined
    if (!deviceService.telemetryLinkAvailable() && !busy) {
      this.host.onLinkLost()
      return
    }
    this.sampling = true
    const startedAt = performance.now()
    try {
      const diagnostics = busy ? undefined : await this.readDiagnostics()
      this.host.onSample({
        at: Date.now(),
        roundTripMs: performance.now() - startedAt,
        feed: feed.stats(),
        values: feed.latestValues(),
        ...(diagnostics ? { diagnostics } : {})
      })
    } finally {
      this.sampling = false
    }
  }

  private async readDiagnostics(): Promise<BenchSample['diagnostics']> {
    if (this.support === 'unsupported') return undefined
    const result = await this.host.deviceService.sendControlCommand(DIAGNOSTICS_COMMAND, {
      poll: true
    })
    if (!result.ok) return undefined
    const reply = result.value.lines.find(isDiagnosticsReply)
    if (reply === undefined) {
      if (result.value.lines.some((line) => line.trim() === PRODUCT_BUILD_REPLY)) {
        this.support = 'unsupported'
        this.host.onNotice(PRODUCT_BUILD)
      }
      return undefined
    }
    if (this.support !== 'supported') {
      this.support = 'supported'
      this.host.onSupportChanged()
    }
    try {
      return parseBenchDiagnostics(reply)
    } catch {
      return undefined
    }
  }
}
