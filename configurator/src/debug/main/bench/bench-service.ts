import {
  DEFAULT_FEED_RATE_HZ,
  DEFAULT_POLL_INTERVAL_MS,
  clampFeedRate,
  clampPollInterval,
  type BenchPatternId,
  type BenchSample,
  type BenchStartRequest,
  type BenchStatus,
  type BenchUpdateRequest
} from '@debug-shared/bench'
import { BENCH_SIGNAL_IDS } from '@debug-shared/bench-signals'
import { buildBenchDashboard } from '@debug-shared/bench-pattern'
import { benchTextCharacters } from '@debug-shared/bench-text'
import { DEFAULT_FONT_FAMILY } from '@shared/font-assets'
import type { DeviceError, DeviceErrorCode, DeviceResult } from '@shared/device'
import { failure, success } from '@main/device/device-errors'
import { ensureBenchAssets, type BenchAssetServices } from './bench-assets'
import { BenchPoller } from './bench-poll'
import { TelemetryFeed, type TelemetryLink } from './telemetry-feed'

const NO_DISPLAY = 'This board has no display, so there is no render pattern to measure.'
const LINK_LOST = 'The serial link went away, so the feed stopped.'
const APPLY_ATTEMPTS = 3
const APPLY_RETRY_DELAY_MS = 1_500
const RETRYABLE_APPLY_CODES: readonly DeviceErrorCode[] = ['busy', 'configuration_rejected']

export class BenchService {
  private readonly feed = new TelemetryFeed()
  private readonly poller: BenchPoller
  private pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
  private rateHz = DEFAULT_FEED_RATE_HZ
  private feedGeneration = 0
  private signals: string[] = [...BENCH_SIGNAL_IDS]
  private pattern: BenchPatternId | undefined
  private patternStage: string | undefined
  private patternBusy = false
  private message: string | undefined
  private restorePoint: string | undefined

  constructor(
    private readonly services: BenchAssetServices,
    private readonly onStatus: (status: BenchStatus) => void,
    onSample: (sample: BenchSample) => void
  ) {
    this.poller = new BenchPoller({
      deviceService: services.deviceService,
      feed: this.feed,
      patternBusy: () => this.patternBusy,
      onSample,
      onNotice: (message) => {
        this.message = message
        this.publish()
      },
      onSupportChanged: () => this.publish(),
      onLinkLost: () => this.linkLost()
    })
  }

  getStatus(): BenchStatus {
    return {
      active: this.poller.active,
      feed: this.feed.stats(),
      pollIntervalMs: this.pollIntervalMs,
      signals: [...this.signals],
      diagnostics: this.poller.diagnostics,
      patternBusy: this.patternBusy,
      ...(this.pattern ? { pattern: this.pattern } : {}),
      ...(this.patternStage ? { patternStage: this.patternStage } : {}),
      ...(this.message ? { message: this.message } : {})
    }
  }

  start(request: BenchStartRequest): DeviceResult<BenchStatus> {
    if (!this.services.deviceService.telemetryLinkAvailable()) {
      return failure({ code: 'serial_error', message: 'No Pitrig board is connected.' })
    }
    this.signals = selectSignals(request.signals)
    this.pollIntervalMs = clampPollInterval(request.pollIntervalMs)
    this.rateHz = clampFeedRate(request.rateHz)
    this.poller.forgetSupport()
    this.message = undefined
    this.feedGeneration += 1
    this.feed.start(this.link, this.rateHz, this.signals)
    this.poller.start(this.pollIntervalMs)
    return success(this.publish())
  }

  update(request: BenchUpdateRequest): DeviceResult<BenchStatus> {
    if (request.signals !== undefined) this.signals = selectSignals(request.signals)
    if (request.pollIntervalMs !== undefined) {
      this.pollIntervalMs = clampPollInterval(request.pollIntervalMs)
      if (this.poller.active) this.poller.start(this.pollIntervalMs)
    }
    if (request.rateHz !== undefined) this.rateHz = clampFeedRate(request.rateHz)
    this.feed.update(this.rateHz, this.signals)
    return success(this.publish())
  }

  stop(): DeviceResult<BenchStatus> {
    this.stopFeed()
    this.poller.stop()
    return success(this.publish())
  }

  async hold(): Promise<void> {
    await this.poller.hold()
  }

  release(): void {
    this.poller.release()
  }

  async applyPattern(pattern: BenchPatternId): Promise<DeviceResult<BenchStatus>> {
    const { deviceService } = this.services
    const session = deviceService.getState().session
    if (!session) {
      return failure({ code: 'serial_error', message: 'No Pitrig board is connected.' })
    }
    if (this.patternBusy) {
      return failure({ code: 'busy', message: 'The bench is already changing the dashboard.' })
    }

    this.patternBusy = true
    this.message = undefined
    if (this.pattern === undefined) this.restorePoint = JSON.stringify(session.configuration)
    const resume = this.pauseFeed()
    this.publish()
    let outcome: DeviceResult<void>
    try {
      outcome = await deviceService.runPipeline(async (): Promise<DeviceResult<void>> => {
        const display = session.info.display
        if (!display) return failure({ code: 'serial_error', message: NO_DISPLAY })
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
    this.stopFeed()
    this.poller.stop()
  }

  private readonly link: TelemetryLink = {
    ready: () => this.services.deviceService.relayAvailable(),
    write: (text, onWritten) => this.services.deviceService.writeTelemetry(text, onWritten)
  }

  private linkLost(): void {
    if (!this.feed.running) return
    this.stopFeed()
    this.poller.stop()
    this.message = LINK_LOST
    this.publish()
  }

  private stopFeed(): void {
    this.feedGeneration += 1
    this.feed.stop()
  }

  private pauseFeed(): () => void {
    if (!this.feed.running) return () => undefined
    const generation = this.feedGeneration
    this.feed.stop()
    return () => {
      if (this.feedGeneration !== generation) return
      this.feed.start(this.link, this.rateHz, this.signals)
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
    if (!retryableApply(last.error)) break
    await new Promise((resolve) => setTimeout(resolve, APPLY_RETRY_DELAY_MS))
    last = await deviceService.applyConfigurationNow(json, ['dashboard'])
  }
  return last
}

function retryableApply(error: DeviceError): boolean {
  return RETRYABLE_APPLY_CODES.includes(error.code)
}

function selectSignals(signals: readonly string[] | undefined): string[] {
  if (signals === undefined) return [...BENCH_SIGNAL_IDS]
  const chosen = BENCH_SIGNAL_IDS.filter((id) => signals.includes(id))
  return chosen.length > 0 ? chosen : [...BENCH_SIGNAL_IDS]
}

function spriteEdge(display: { width: number; height: number }): number {
  return Math.round(Math.min(display.width / 6, display.height / 5)) - 6
}
