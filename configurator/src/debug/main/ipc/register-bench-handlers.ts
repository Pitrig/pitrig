import { ipcMain } from 'electron'

import {
  BENCH_APPLY_PATTERN_CHANNEL,
  BENCH_GET_STATUS_CHANNEL,
  BENCH_HOLD_CHANNEL,
  BENCH_PATTERN_IDS,
  BENCH_RELEASE_CHANNEL,
  BENCH_RESTORE_CHANNEL,
  BENCH_START_CHANNEL,
  BENCH_STOP_CHANNEL,
  BENCH_UPDATE_CHANNEL,
  POLL_INTERVALS_MS,
  type BenchPatternId,
  type BenchPatternRequest,
  type BenchStartRequest,
  type BenchStatus,
  type BenchUpdateRequest
} from '@debug-shared/bench'
import type { DeviceResult } from '@shared/device'
import type { BenchService } from '../bench/bench-service'

export function registerBenchHandlers(bench: BenchService): void {
  ipcMain.handle(BENCH_GET_STATUS_CHANNEL, (): BenchStatus => bench.getStatus())
  ipcMain.handle(BENCH_START_CHANNEL, (_event, request: unknown) =>
    isStartRequest(request) ? bench.start(request) : invalidBenchRequest()
  )
  ipcMain.handle(BENCH_UPDATE_CHANNEL, (_event, request: unknown) =>
    isUpdateRequest(request) ? bench.update(request) : invalidBenchRequest()
  )
  ipcMain.handle(BENCH_STOP_CHANNEL, () => bench.stop())
  ipcMain.handle(BENCH_APPLY_PATTERN_CHANNEL, (_event, request: unknown) =>
    isPatternRequest(request) ? bench.applyPattern(request.pattern) : invalidBenchRequest()
  )
  ipcMain.handle(BENCH_RESTORE_CHANNEL, () => bench.restore())
  ipcMain.handle(BENCH_HOLD_CHANNEL, () => bench.hold())
  ipcMain.handle(BENCH_RELEASE_CHANNEL, () => bench.release())
}

function invalidBenchRequest(): DeviceResult<never> {
  return { ok: false, error: { code: 'invalid_request', message: 'Invalid bench request.' } }
}

function isSignalList(value: unknown): value is string[] | undefined {
  if (value === undefined) return true
  return (
    Array.isArray(value) &&
    value.length <= 64 &&
    value.every((entry) => typeof entry === 'string' && entry.length <= 32)
  )
}

function isPollInterval(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    POLL_INTERVALS_MS.includes(value as (typeof POLL_INTERVALS_MS)[number])
  )
}

function isStartRequest(value: unknown): value is BenchStartRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<BenchStartRequest>
  return (
    typeof request.rateHz === 'number' &&
    Number.isFinite(request.rateHz) &&
    isPollInterval(request.pollIntervalMs) &&
    isSignalList(request.signals)
  )
}

function isUpdateRequest(value: unknown): value is BenchUpdateRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<BenchUpdateRequest>
  return (
    (request.rateHz === undefined ||
      (typeof request.rateHz === 'number' && Number.isFinite(request.rateHz))) &&
    (request.pollIntervalMs === undefined || isPollInterval(request.pollIntervalMs)) &&
    isSignalList(request.signals)
  )
}

function isPatternRequest(value: unknown): value is BenchPatternRequest {
  if (!value || typeof value !== 'object') return false
  const pattern = (value as Partial<BenchPatternRequest>).pattern
  return BENCH_PATTERN_IDS.includes(pattern as BenchPatternId)
}
