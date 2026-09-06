import { performance } from 'node:perf_hooks'

import {
  emptyQuantiles,
  type LatencyQuantiles,
  type TelemetryBridgeMetrics
} from '@shared/telemetry-bridge'

const SAMPLE_CAPACITY = 1_024
const BUCKET_MS = 100
const BUCKETS = 10

class Histogram {
  private readonly samples = new Float64Array(SAMPLE_CAPACITY)
  private readonly sorted = new Float64Array(SAMPLE_CAPACITY)
  private count = 0
  private next = 0
  private peak = 0

  add(value: number): void {
    this.samples[this.next] = value
    this.next = (this.next + 1) % SAMPLE_CAPACITY
    if (this.count < SAMPLE_CAPACITY) this.count += 1
    if (value > this.peak) this.peak = value
  }

  reset(): void {
    this.count = 0
    this.next = 0
    this.peak = 0
  }

  quantiles(): LatencyQuantiles {
    if (this.count === 0) return emptyQuantiles()
    const window = this.sorted.subarray(0, this.count)
    window.set(this.samples.subarray(0, this.count))
    window.sort()
    return {
      p50: at(window, 0.5),
      p95: at(window, 0.95),
      p99: at(window, 0.99),
      max: this.peak,
      samples: this.count
    }
  }
}

function at(window: Float64Array, quantile: number): number {
  const index = Math.min(window.length - 1, Math.floor(window.length * quantile))
  return window[index] ?? 0
}

class RateWindow {
  private readonly buckets = new Float64Array(BUCKETS)
  private index = 0
  private start = performance.now()

  reset(now: number): void {
    this.buckets.fill(0)
    this.index = 0
    this.start = now
  }

  add(now: number, amount: number): void {
    this.rotate(now)
    this.buckets[this.index] = (this.buckets[this.index] ?? 0) + amount
  }

  perSecond(now: number): number {
    this.rotate(now)
    let total = 0
    for (const bucket of this.buckets) total += bucket
    const span = (BUCKETS - 1) * BUCKET_MS + (now - this.start)
    return total / (Math.max(BUCKET_MS, Math.min(span, BUCKETS * BUCKET_MS)) / 1_000)
  }

  private rotate(now: number): void {
    if (now - this.start >= BUCKET_MS * BUCKETS) {
      this.reset(now)
      return
    }
    while (now - this.start >= BUCKET_MS) {
      this.index = (this.index + 1) % BUCKETS
      this.buckets[this.index] = 0
      this.start += BUCKET_MS
    }
  }
}

export class BridgeMetrics {
  private readonly handoff = new Histogram()
  private readonly drain = new Histogram()
  private readonly lines = new RateWindow()
  private readonly bytes = new RateWindow()
  private readonly fields = new RateWindow()
  private unknownLines = 0
  private droppedBytes = 0
  private writeErrors = 0

  reset(): void {
    const now = performance.now()
    this.handoff.reset()
    this.drain.reset()
    this.lines.reset(now)
    this.bytes.reset(now)
    this.fields.reset(now)
    this.unknownLines = 0
    this.droppedBytes = 0
    this.writeErrors = 0
  }

  recordChunk(now: number, byteCount: number): void {
    this.bytes.add(now, byteCount)
  }

  recordDecoded(now: number, lineCount: number, fieldCount: number, unknown: number): void {
    this.lines.add(now, lineCount)
    this.fields.add(now, fieldCount)
    this.unknownLines += unknown
  }

  recordHandoff(milliseconds: number): void {
    this.handoff.add(milliseconds)
  }

  recordDrain(milliseconds: number): void {
    this.drain.add(milliseconds)
  }

  recordDropped(byteCount: number): void {
    this.droppedBytes += byteCount
  }

  recordWriteError(): void {
    this.writeErrors += 1
  }

  snapshot(): TelemetryBridgeMetrics {
    const now = performance.now()
    return {
      linesPerSecond: this.lines.perSecond(now),
      bytesPerSecond: this.bytes.perSecond(now),
      fieldsPerSecond: this.fields.perSecond(now),
      unknownLines: this.unknownLines,
      droppedBytes: this.droppedBytes,
      writeErrors: this.writeErrors,
      handoff: this.handoff.quantiles(),
      drain: this.drain.quantiles()
    }
  }
}
