import { performance } from 'node:perf_hooks'

import type { BenchDiagnosticsSupport, BenchSample } from '@debug-shared/bench'
import type { DeviceService } from '@main/device/device-service'
import { isDiagnosticsReply, parseBenchDiagnostics } from './bench-diagnostics'
import type { TelemetryFeed } from './telemetry-feed'

const DIAGNOSTICS_COMMAND = '@PR:DIAG'
const PRODUCT_BUILD = 'This board runs a product build; flash a debug build for diagnostics.'

export interface BenchPollHost {
  deviceService: DeviceService
  feed: TelemetryFeed
  patternBusy: () => boolean
  onSample: (sample: BenchSample) => void
  onNotice: (message: string) => void
  onSupportChanged: () => void
  onLinkLost: () => void
}

export class BenchPoller {
  private timer: NodeJS.Timeout | undefined
  private sampling = false
  private holds = 0
  private inFlight: Promise<void> | undefined
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
    this.holds = 0
    this.timer = setInterval(this.tick, intervalMs)
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  forgetSupport(): void {
    this.support = 'unknown'
  }

  async hold(): Promise<void> {
    this.holds += 1
    await this.inFlight
  }

  release(): void {
    this.holds = Math.max(0, this.holds - 1)
  }

  private readonly tick = (): void => {
    if (this.sampling || this.holds > 0) return
    this.inFlight = this.sample().finally(() => {
      this.inFlight = undefined
    })
  }

  private async sample(): Promise<void> {
    const { deviceService, feed, patternBusy } = this.host
    if (!deviceService.telemetryLinkAvailable() && !patternBusy()) {
      this.host.onLinkLost()
      return
    }
    this.sampling = true
    const startedAt = performance.now()
    try {
      const diagnostics = patternBusy() ? undefined : await this.readDiagnostics()
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
    const result = await this.host.deviceService.sendControlCommand(DIAGNOSTICS_COMMAND)
    if (!result.ok) return undefined
    const reply = result.value.lines.find(isDiagnosticsReply)
    if (reply === undefined) {
      if (result.value.lines.some((line) => line.startsWith('@PR:ERR:'))) {
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
