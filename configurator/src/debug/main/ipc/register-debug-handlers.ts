import { ipcMain } from 'electron'

import { registerBenchHandlers } from './register-bench-handlers'
import { broadcastToWindows } from '@main/ipc/broadcast'
import {
  BENCH_SAMPLE_CHANNEL,
  BENCH_STATUS_CHANGED_CHANNEL,
  type BenchSample,
  type BenchStatus
} from '@debug-shared/bench'
import { CONTROL_COMMAND_CHANNEL, SERIAL_TRAFFIC_CHANNEL } from '@debug-shared/debug-channels'
import {
  MAXIMUM_CONTROL_COMMAND_LENGTH,
  type ControlCommandRequest,
  type ControlCommandResult
} from '@shared/control-command'
import {
  FIRMWARE_REGISTER_SOURCE_CHANNEL,
  type FirmwareRegisterSourceRequest,
  type FirmwareUpdateResult
} from '@shared/firmware-update'
import type { SerialTrafficLog } from '@shared/serial-traffic'
import type { BenchService } from '../bench/bench-service'
import type { DeviceService } from '@main/device/device-service'
import type { FirmwareUpdateService } from '@main/firmware-update/firmware-update-service'

const MAXIMUM_PENDING_TRAFFIC = 4_000
const RETAINED_TRAFFIC = 2_000
const TRAFFIC_FLUSH_MS = 100

export function registerDebugHandlers(
  deviceService: DeviceService,
  firmwareUpdateService: FirmwareUpdateService,
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
  ipcMain.handle(FIRMWARE_REGISTER_SOURCE_CHANNEL, (_event, request: unknown) => {
    const path =
      request !== null && typeof request === 'object'
        ? (request as Partial<FirmwareRegisterSourceRequest>).path
        : undefined
    if (typeof path !== 'string') {
      const result: FirmwareUpdateResult<void> = {
        ok: false,
        error: { code: 'invalid_request', message: 'Invalid firmware source request.' }
      }
      return result
    }
    return firmwareUpdateService.registerSourcePath(path)
  })
}

function isControlCommandRequest(value: unknown): value is ControlCommandRequest {
  if (!value || typeof value !== 'object') return false
  const command = (value as Partial<ControlCommandRequest>).command
  return typeof command === 'string' && command.length <= MAXIMUM_CONTROL_COMMAND_LENGTH
}

const pendingSerialTraffic: SerialTrafficLog[] = []
let serialTrafficFlushTimer: ReturnType<typeof setTimeout> | undefined

export function broadcastSerialTraffic(log: SerialTrafficLog): void {
  pendingSerialTraffic.push(log)
  if (pendingSerialTraffic.length > MAXIMUM_PENDING_TRAFFIC) {
    pendingSerialTraffic.splice(0, pendingSerialTraffic.length - RETAINED_TRAFFIC)
  }
  serialTrafficFlushTimer ??= setTimeout(() => {
    serialTrafficFlushTimer = undefined
    broadcastToWindows(SERIAL_TRAFFIC_CHANNEL, pendingSerialTraffic.splice(0))
  }, TRAFFIC_FLUSH_MS)
}

export function broadcastBenchStatus(status: BenchStatus): void {
  broadcastToWindows(BENCH_STATUS_CHANGED_CHANNEL, status)
}

export function broadcastBenchSample(sample: BenchSample): void {
  broadcastToWindows(BENCH_SAMPLE_CHANNEL, sample)
}
