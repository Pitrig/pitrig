import type {
  BenchPatternRequest,
  BenchResult,
  BenchSample,
  BenchStartRequest,
  BenchStatus,
  BenchUpdateRequest
} from './bench'
import type { ControlCommandRequest, ControlCommandResult } from '@shared/control-command'
import type {
  FirmwareRegisterSourceRequest,
  FirmwareSourceSelection,
  FirmwareUpdateResult
} from '@shared/firmware-update'
import type { SimCoreApi } from '@shared/ipc'
import type { SerialTrafficLog } from '@shared/serial-traffic'

export interface SimCoreDebugApi extends SimCoreApi {
  sendControlCommand: (request: ControlCommandRequest) => Promise<ControlCommandResult>
  registerFirmwareSource: (
    request: FirmwareRegisterSourceRequest
  ) => Promise<FirmwareUpdateResult<FirmwareSourceSelection>>
  getBenchStatus: () => Promise<BenchStatus>
  startBench: (request: BenchStartRequest) => Promise<BenchResult<BenchStatus>>
  updateBench: (request: BenchUpdateRequest) => Promise<BenchResult<BenchStatus>>
  stopBench: () => Promise<BenchResult<BenchStatus>>
  applyBenchPattern: (request: BenchPatternRequest) => Promise<BenchResult<BenchStatus>>
  restoreBenchDashboard: () => Promise<BenchResult<BenchStatus>>
  onSerialTraffic: (listener: (logs: SerialTrafficLog[]) => void) => () => void
  onBenchStatus: (listener: (status: BenchStatus) => void) => () => void
  onBenchSample: (listener: (sample: BenchSample) => void) => () => void
}
