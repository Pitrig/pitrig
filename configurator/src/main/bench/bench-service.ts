import { performance } from 'node:perf_hooks'

import {
  DEFAULT_POLL_INTERVAL_MS,
  clampFeedRate,
  clampPollInterval,
  type BenchDiagnosticsSupport,
  type BenchPatternId,
  type BenchSample,
  type BenchStartRequest,
  type BenchStatus,
  type BenchUpdateRequest
} from '../../shared/bench'
import { BENCH_SIGNAL_IDS } from '../../shared/bench-signals'
import { buildBenchDashboard } from '../../shared/bench-pattern'
import { benchTextCharacters } from '../../shared/bench-text'
import { DEFAULT_FONT_FAMILY } from '../../shared/font-assets'
import type { DeviceResult } from '../../shared/device'
import { failure, success } from '../device/device-errors'
import { ensureBenchAssets, type BenchAssetServices } from './bench-assets'
import { isDiagnosticsReply, parseBenchDiagnostics } from './bench-diagnostics'
import { TelemetryFeed } from './telemetry-feed'

const DIAGNOSTICS_COMMAND = '@SC:DIAG'
const APPLY_ATTEMPTS = 3
const APPLY_RETRY_DELAY_MS = 1_500

export class BenchService {
  private readonly feed = new TelemetryFeed()
  private poll: NodeJS.Timeout | undefined
  private polling = false
  private pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
  private signals: string[] = [...BENCH_SIGNAL_IDS]
  private diagnostics: BenchDiagnosticsSupport = 'unknown'
  private pattern: BenchPatternId | undefined
  private patternStage: string | undefined
  private patternBusy = false
  private message: string | undefined
  private restorePoint: string | undefined

  constructor(
    private readonly services: BenchAssetServices,
    private readonly onStatus: (status: BenchStatus) => void,
    private readonly onSample: (sample: BenchSample) => void
  ) {}

  getStatus(): BenchStatus {
    return {
      active: this.poll !== undefined,
      feed: this.feed.stats(),
      pollIntervalMs: this.pollIntervalMs,
      signals: [...this.signals],
      diagnostics: this.diagnostics,
      patternBusy: this.patternBusy,
      ...(this.pattern ? { pattern: this.pattern } : {}),
      ...(this.patternStage ? { patternStage: this.patternStage } : {}),
      ...(this.message ? { message: this.message } : {})
    }
  }

  start(request: BenchStartRequest): DeviceResult<BenchStatus> {
    if (!this.services.deviceService.telemetryLinkAvailable()) {
      return failure({ code: 'serial_error', message: 'No SimCore board is connected.' })
    }
    this.signals = selectSignals(request.signals)
    this.pollIntervalMs = clampPollInterval(request.pollIntervalMs)
    this.diagnostics = 'unknown'
    this.message = undefined
    this.feed.start(this.writer, clampFeedRate(request.rateHz), this.signals)
    this.startPolling()
    return success(this.publish())
  }

  update(request: BenchUpdateRequest): DeviceResult<BenchStatus> {
    if (request.signals !== undefined) this.signals = selectSignals(request.signals)
    if (request.pollIntervalMs !== undefined) {
      this.pollIntervalMs = clampPollInterval(request.pollIntervalMs)
      if (this.poll !== undefined) this.startPolling()
    }
    this.feed.update(
      request.rateHz === undefined ? undefined : clampFeedRate(request.rateHz),
      this.signals
    )
    return success(this.publish())
  }

  stop(): DeviceResult<BenchStatus> {
    this.feed.stop()
    this.stopPolling()
    return success(this.publish())
  }

  async applyPattern(pattern: BenchPatternId): Promise<DeviceResult<BenchStatus>> {
    const { deviceService } = this.services
    const session = deviceService.getState().session
    if (!session) {
      return failure({ code: 'serial_error', message: 'No SimCore board is connected.' })
    }
    if (this.patternBusy) {
      return failure({ code: 'busy', message: 'The bench is already changing the dashboard.' })
    }

    this.patternBusy = true
    this.message = undefined
    const resume = this.pauseFeed()
    this.publish()
    let outcome: DeviceResult<void>
    try {
      outcome = await deviceService.runPipeline(async (): Promise<DeviceResult<void>> => {
        const display = session.info.display
        const characters = benchTextCharacters(
          buildBenchDashboard({
            board: session.info.boardId,
            pattern,
            display,
            family: DEFAULT_FONT_FAMILY
          })
        )
        const assets = await ensureBenchAssets(
          this.services,
          spriteEdge(display),
          characters,
          (stage) => {
            this.patternStage = stage
            this.publish()
          }
        )
        if (!assets.ok) return failure(assets.error)

        const current = deviceService.getState().session
        if (!current) {
          return failure({ code: 'serial_error', message: 'The board went away during setup.' })
        }
        if (this.restorePoint === undefined) {
          this.restorePoint = JSON.stringify(current.configuration)
        }

        this.patternStage = 'Applying pattern…'
        this.publish()
        const document = buildBenchDashboard({
          board: current.info.boardId,
          pattern,
          display,
          ...(assets.value.family ? { family: assets.value.family } : {}),
          ...(assets.value.image ? { image: assets.value.image } : {})
        })
        const applied = await applyWithRetry(deviceService, JSON.stringify(document))
        if (!applied.ok) return failure(applied.error)
        this.pattern = pattern
        this.message = assets.value.notes.join(' ') || undefined
        return success(undefined)
      })
    } finally {
      this.patternBusy = false
      this.patternStage = undefined
      resume()
      this.publish()
    }
    return outcome.ok ? success(this.getStatus()) : failure(outcome.error)
  }

  async restore(): Promise<DeviceResult<BenchStatus>> {
    const { deviceService } = this.services
    const json = this.restorePoint
    if (json === undefined) {
      return failure({ code: 'invalid_request', message: 'The bench has nothing to restore.' })
    }
    if (this.patternBusy) {
      return failure({ code: 'busy', message: 'The bench is already changing the dashboard.' })
    }
    this.patternBusy = true
    const resume = this.pauseFeed()
    this.publish()
    let outcome: DeviceResult<void>
    try {
      const applied = await applyWithRetry(deviceService, json)
      outcome = applied.ok ? success(undefined) : failure(applied.error)
      if (applied.ok) {
        this.pattern = undefined
        this.restorePoint = undefined
      }
    } finally {
      this.patternBusy = false
      resume()
      this.publish()
    }
    return outcome.ok ? success(this.getStatus()) : failure(outcome.error)
  }

  dispose(): void {
    this.feed.stop()
    this.stopPolling()
  }

  private readonly writer = (text: string, onWritten?: (error?: Error) => void): boolean =>
    this.services.deviceService.writeTelemetry(text, onWritten)

  private pauseFeed(): () => void {
    const stats = this.feed.stats()
    if (!stats.running) return () => undefined
    this.feed.stop()
    return () => this.feed.start(this.writer, stats.rateHz, this.signals)
  }

  private startPolling(): void {
    this.stopPolling()
    this.poll = setInterval(() => void this.sample(), this.pollIntervalMs)
  }

  private stopPolling(): void {
    if (this.poll !== undefined) clearInterval(this.poll)
    this.poll = undefined
  }

  private async sample(): Promise<void> {
    if (this.polling) return
    const { deviceService } = this.services
    if (!deviceService.telemetryLinkAvailable() && !this.patternBusy) {
      if (this.feed.running) {
        this.feed.stop()
        this.stopPolling()
        this.message = 'The serial link went away, so the feed stopped.'
        this.publish()
      }
      return
    }

    this.polling = true
    const startedAt = performance.now()
    try {
      const diagnostics = this.patternBusy ? undefined : await this.readDiagnostics()
      this.onSample({
        at: Date.now(),
        roundTripMs: performance.now() - startedAt,
        feed: this.feed.stats(),
        values: this.feed.latestValues(),
        ...(diagnostics ? { diagnostics } : {})
      })
    } finally {
      this.polling = false
    }
  }

  private async readDiagnostics(): Promise<BenchSample['diagnostics']> {
    if (this.diagnostics === 'unsupported') return undefined
    const result = await this.services.deviceService.sendControlCommand(DIAGNOSTICS_COMMAND)
    if (!result.ok) return undefined
    const reply = result.value.lines.find(isDiagnosticsReply)
    if (reply === undefined) {
      if (result.value.lines.some((line) => line.startsWith('@SC:ERR:'))) {
        this.diagnostics = 'unsupported'
        this.message = 'This board runs a product build; flash a debug build for diagnostics.'
        this.publish()
      }
      return undefined
    }
    if (this.diagnostics !== 'supported') {
      this.diagnostics = 'supported'
      this.publish()
    }
    try {
      return parseBenchDiagnostics(reply)
    } catch {
      return undefined
    }
  }

  private publish(): BenchStatus {
    const status = this.getStatus()
    this.onStatus(status)
    return status
  }
}

async function applyWithRetry(
  deviceService: BenchAssetServices['deviceService'],
  json: string
): Promise<DeviceResult<unknown>> {
  let last = await deviceService.applyConfigurationNow(json, ['dashboard'])
  for (let attempt = 1; !last.ok && attempt < APPLY_ATTEMPTS; ++attempt) {
    if (last.error.code !== 'configuration_rejected' && last.error.code !== 'busy') break
    if (!/did not answer|busy/i.test(last.error.message)) break
    await new Promise((resolve) => setTimeout(resolve, APPLY_RETRY_DELAY_MS))
    last = await deviceService.applyConfigurationNow(json, ['dashboard'])
  }
  return last
}

function selectSignals(signals: readonly string[] | undefined): string[] {
  if (signals === undefined) return [...BENCH_SIGNAL_IDS]
  const chosen = BENCH_SIGNAL_IDS.filter((id) => signals.includes(id))
  return chosen.length > 0 ? chosen : [...BENCH_SIGNAL_IDS]
}

function spriteEdge(display: { width: number; height: number }): number {
  return Math.round(Math.min(display.width / 6, display.height / 5)) - 6
}
