import type {
  BenchPatternRequest,
  BenchResult,
  BenchSample,
  BenchStartRequest,
  BenchStatus,
  BenchUpdateRequest
} from './bench'
import type { ControlCommandRequest, ControlCommandResult } from '@shared/control-command'
import type { PitrigApi } from '@shared/ipc'
import type { SerialTrafficLog } from '@shared/serial-traffic'

export interface PitrigDebugApi extends PitrigApi {
  sendControlCommand: (request: ControlCommandRequest) => Promise<ControlCommandResult>
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
