import type { BenchDiagnostics } from '@debug-shared/bench'
import { parseFields } from '@main/device/protocol-parsers'

const DIAGNOSTICS_PREFIX = '@SC:OK:DIAG:'

export function isDiagnosticsReply(line: string): boolean {
  return line.startsWith(DIAGNOSTICS_PREFIX)
}

export function parseBenchDiagnostics(line: string): BenchDiagnostics {
  const fields = parseFields(line, DIAGNOSTICS_PREFIX, 'diagnostics')
  const number = (key: string): number => {
    const value = fields.get(key)
    if (value === undefined) return 0
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return {
    fps: number('fps'),
    cpuCore0: number('cpu0'),
    cpuCore1: number('cpu1'),
    renderUs: number('render_us'),
    flushUs: number('flush_us'),
    syncUs: number('sync_us'),
    frameMaxUs: number('frame_max_us'),
    workMaxUs: number('work_max_us'),
    gapMaxUs: number('gap_max_us'),
    invalidatedPx: number('inval_px'),
    invalidatedAreas: number('inval_areas'),
    drawnAreas: number('drawn_areas'),
    latencyUs: number('lat_us'),
    latencyMaxUs: number('lat_max_us'),
    latencySamples: number('lat_n'),
    internalTotal: number('internal_total'),
    internalFree: number('internal_free'),
    internalMinimum: number('internal_min'),
    internalLargest: number('internal_largest'),
    psramTotal: number('psram_total'),
    psramFree: number('psram_free'),
    psramMinimum: number('psram_min'),
    psramLargest: number('psram_largest'),
    stackLvgl: number('stack_lvgl'),
    stackTransport: number('stack_transport'),
    stackControl: number('stack_control'),
    stackUpload: number('stack_upload'),
    stackSampler: number('stack_sampler'),
    uptimeMs: number('uptime_ms')
  }
}
