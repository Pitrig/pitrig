import { performance } from 'node:perf_hooks'

import type { BenchFeedStats } from '@debug-shared/bench'
import {
  BENCH_SIGNALS,
  benchSignalLine,
  benchSignalValue,
  type BenchSignal
} from '@debug-shared/bench-signals'

export type TelemetryWriter = (text: string, onWritten?: (error?: Error) => void) => boolean

const BUCKET_MS = 100
const BUCKETS = 10
const MAXIMUM_PENDING_WRITES = 3
const EARLY_WAKE_MS = 0.75
const MAXIMUM_CATCH_UP_TICKS = 3

export class TelemetryFeed {
  private timer: NodeJS.Timeout | undefined
  private nextTickAt = 0
  private periodMs = 0
  private writer: TelemetryWriter | undefined
  private signals: BenchSignal[] = []
  private rateHz = 0
  private startedAt = 0
  private pending = 0
  private droppedTicks = 0
  private writeErrors = 0
  private bucketStart = 0
  private bucketIndex = 0
  private readonly tickBuckets = new Array<number>(BUCKETS).fill(0)
  private readonly lineBuckets = new Array<number>(BUCKETS).fill(0)
  private readonly byteBuckets = new Array<number>(BUCKETS).fill(0)
  private readonly values: Record<string, number> = {}

  get running(): boolean {
    return this.timer !== undefined
  }

  start(writer: TelemetryWriter, rateHz: number, signalIds?: readonly string[]): void {
    this.stop()
    this.writer = writer
    this.rateHz = rateHz
    this.signals = selectSignals(signalIds)
    this.startedAt = performance.now()
    this.periodMs = 1_000 / Math.max(1, rateHz)
    this.nextTickAt = this.startedAt + this.periodMs
    this.pending = 0
    this.droppedTicks = 0
    this.writeErrors = 0
    this.resetBuckets(this.startedAt)
    this.schedule()
  }

  update(rateHz?: number, signalIds?: readonly string[]): void {
    if (signalIds !== undefined) this.signals = selectSignals(signalIds)
    if (rateHz === undefined || rateHz === this.rateHz || !this.running) return
    this.rateHz = rateHz
    this.periodMs = 1_000 / Math.max(1, rateHz)
    this.nextTickAt = performance.now() + this.periodMs
  }

  stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.writer = undefined
    this.pending = 0
  }

  stats(): BenchFeedStats {
    const now = performance.now()
    this.rotate(now)
    const seconds = this.coveredSeconds(now)
    return {
      running: this.running,
      rateHz: this.rateHz,
      measuredRateHz: sum(this.tickBuckets) / seconds,
      linesPerSecond: sum(this.lineBuckets) / seconds,
      bytesPerSecond: sum(this.byteBuckets) / seconds,
      signalCount: this.signals.length,
      droppedTicks: this.droppedTicks,
      writeErrors: this.writeErrors,
      elapsedMs: this.running ? now - this.startedAt : 0
    }
  }

  latestValues(): Record<string, number> {
    return { ...this.values }
  }

  private schedule(): void {
    const delay = this.nextTickAt - performance.now()
    this.timer = setTimeout(this.tick, delay > 0 ? Math.floor(delay) : 0)
  }

  private readonly tick = (): void => {
    if (this.writer === undefined) {
      this.timer = undefined
      return
    }
    if (performance.now() < this.nextTickAt - EARLY_WAKE_MS) {
      this.schedule()
      return
    }
    let emitted = 0
    while (emitted < MAXIMUM_CATCH_UP_TICKS) {
      const now = performance.now()
      if (now < this.nextTickAt - EARLY_WAKE_MS) break
      this.nextTickAt += this.periodMs
      this.emit(now)
      emitted += 1
    }
    const behind = performance.now() - this.nextTickAt
    if (behind > this.periodMs) this.nextTickAt = performance.now() + this.periodMs
    this.schedule()
  }

  private emit(now: number): void {
    this.rotate(now)
    const writer = this.writer
    if (writer === undefined) return
    if (this.pending >= MAXIMUM_PENDING_WRITES) {
      this.droppedTicks += 1
      return
    }

    const elapsed = now - this.startedAt
    let batch = ''
    for (const signal of this.signals) {
      const value = benchSignalValue(signal, elapsed)
      this.values[signal.id] = value
      const line = benchSignalLine(signal, value)
      if (line !== undefined) batch += line
    }
    if (batch.length === 0) return

    this.pending += 1
    writer(batch, (error) => {
      this.pending = Math.max(0, this.pending - 1)
      if (error) this.writeErrors += 1
    })
    const bucket = this.bucketIndex
    this.tickBuckets[bucket] = (this.tickBuckets[bucket] ?? 0) + 1
    this.lineBuckets[bucket] = (this.lineBuckets[bucket] ?? 0) + this.signals.length
    this.byteBuckets[bucket] = (this.byteBuckets[bucket] ?? 0) + Buffer.byteLength(batch, 'utf8')
  }

  private rotate(now: number): void {
    if (now - this.bucketStart >= BUCKET_MS * BUCKETS) {
      this.resetBuckets(now)
      return
    }
    while (now - this.bucketStart >= BUCKET_MS) {
      this.bucketIndex = (this.bucketIndex + 1) % BUCKETS
      this.tickBuckets[this.bucketIndex] = 0
      this.lineBuckets[this.bucketIndex] = 0
      this.byteBuckets[this.bucketIndex] = 0
      this.bucketStart += BUCKET_MS
    }
  }

  private resetBuckets(now: number): void {
    this.tickBuckets.fill(0)
    this.lineBuckets.fill(0)
    this.byteBuckets.fill(0)
    this.bucketIndex = 0
    this.bucketStart = now
  }

  private coveredSeconds(now: number): number {
    const span = (BUCKETS - 1) * BUCKET_MS + (now - this.bucketStart)
    const window = Math.min(now - this.startedAt, span)
    return Math.max(BUCKET_MS, window) / 1_000
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function selectSignals(signalIds?: readonly string[]): BenchSignal[] {
  if (signalIds === undefined) return [...BENCH_SIGNALS]
  const wanted = new Set(signalIds)
  return BENCH_SIGNALS.filter((signal) => wanted.has(signal.id))
}
