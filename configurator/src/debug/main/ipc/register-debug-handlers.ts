import { ipcMain } from 'electron'

import { registerBenchHandlers } from './register-bench-handlers'
import { broadcastToWindows } from '@main/ipc/broadcast'
import {
  BENCH_SAMPLE_CHANNEL,
  BENCH_STATUS_CHANGED_CHANNEL,
  type BenchSample,
  type BenchStatus
} from '@debug-shared/bench'
import { CONTROL_COMMAND_CHANNEL } from '@debug-shared/debug-channels'
import {
  MAXIMUM_CONTROL_COMMAND_LENGTH,
  type ControlCommandRequest,
  type ControlCommandResult
} from '@shared/control-command'
import type { BenchService } from '../bench/bench-service'
import type { DeviceService } from '@main/device/device-service'

export function registerDebugHandlers(
  deviceService: DeviceService,
  benchService: BenchService
): void {
  registerBenchHandlers(benchService)
  ipcMain.handle(CONTROL_COMMAND_CHANNEL, (_event, request: unknown) => {
    if (!isControlCommandRequest(request)) {
      const result: ControlCommandResult = {
        ok: false,
        error: { code: 'invalid_request', message: 'Invalid control command request.' }
      }
      return result
    }
    return deviceService.sendControlCommand(request.command)
  })
}

function isControlCommandRequest(value: unknown): value is ControlCommandRequest {
  if (!value || typeof value !== 'object') return false
  const command = (value as Partial<ControlCommandRequest>).command
  return typeof command === 'string' && command.length <= MAXIMUM_CONTROL_COMMAND_LENGTH
}

export function broadcastBenchStatus(status: BenchStatus): void {
  broadcastToWindows(BENCH_STATUS_CHANGED_CHANNEL, status)
}

export function broadcastBenchSample(sample: BenchSample): void {
  broadcastToWindows(BENCH_SAMPLE_CHANNEL, sample)
}
