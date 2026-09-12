import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import { productApi } from '../../preload/api'
import {
  BENCH_APPLY_PATTERN_CHANNEL,
  BENCH_GET_STATUS_CHANNEL,
  BENCH_HOLD_CHANNEL,
  BENCH_RELEASE_CHANNEL,
  BENCH_RESTORE_CHANNEL,
  BENCH_SAMPLE_CHANNEL,
  BENCH_START_CHANNEL,
  BENCH_STATUS_CHANGED_CHANNEL,
  BENCH_STOP_CHANNEL,
  BENCH_UPDATE_CHANNEL,
  type BenchSample,
  type BenchStatus
} from '../shared/bench'
import { CONTROL_COMMAND_CHANNEL, SERIAL_TRAFFIC_CHANNEL } from '../shared/debug-channels'
import type { PitrigDebugApi } from '../shared/debug-ipc'
import type { ControlCommandRequest } from '../../shared/control-command'
import type { SerialTrafficLog } from '../../shared/serial-traffic'

function holdingBench<Args extends unknown[], Value>(
  call: (...args: Args) => Promise<Value>
): (...args: Args) => Promise<Value> {
  return async (...args: Args) => {
    await ipcRenderer.invoke(BENCH_HOLD_CHANNEL)
    try {
      return await call(...args)
    } finally {
      void ipcRenderer.invoke(BENCH_RELEASE_CHANNEL)
    }
  }
}

const debugApi: PitrigDebugApi = {
  ...productApi,
  readDeviceConfiguration: holdingBench(productApi.readDeviceConfiguration),
  applyDeviceConfiguration: holdingBench(productApi.applyDeviceConfiguration),
  saveDeviceConfiguration: holdingBench(productApi.saveDeviceConfiguration),
  resetDeviceConfiguration: holdingBench(productApi.resetDeviceConfiguration),
  rebootDevice: holdingBench(productApi.rebootDevice),
  uploadFirmware: holdingBench(productApi.uploadFirmware),
  cancelFirmwareUpload: holdingBench(productApi.cancelFirmwareUpload),
  sendControlCommand: holdingBench((request: ControlCommandRequest) =>
    ipcRenderer.invoke(CONTROL_COMMAND_CHANNEL, request)
  ),
  getBenchStatus: () => ipcRenderer.invoke(BENCH_GET_STATUS_CHANNEL),
  startBench: (request) => ipcRenderer.invoke(BENCH_START_CHANNEL, request),
  updateBench: (request) => ipcRenderer.invoke(BENCH_UPDATE_CHANNEL, request),
  stopBench: () => ipcRenderer.invoke(BENCH_STOP_CHANNEL),
  applyBenchPattern: (request) => ipcRenderer.invoke(BENCH_APPLY_PATTERN_CHANNEL, request),
  restoreBenchDashboard: () => ipcRenderer.invoke(BENCH_RESTORE_CHANNEL),
  onSerialTraffic: (listener: (logs: SerialTrafficLog[]) => void) => {
    const handler = (_event: IpcRendererEvent, logs: SerialTrafficLog[]): void => listener(logs)
    ipcRenderer.on(SERIAL_TRAFFIC_CHANNEL, handler)
    return () => ipcRenderer.removeListener(SERIAL_TRAFFIC_CHANNEL, handler)
  },
  onBenchStatus: (listener: (status: BenchStatus) => void) => {
    const handler = (_event: IpcRendererEvent, status: BenchStatus): void => listener(status)
    ipcRenderer.on(BENCH_STATUS_CHANGED_CHANNEL, handler)
    return () => ipcRenderer.removeListener(BENCH_STATUS_CHANGED_CHANNEL, handler)
  },
  onBenchSample: (listener: (sample: BenchSample) => void) => {
    const handler = (_event: IpcRendererEvent, sample: BenchSample): void => listener(sample)
    ipcRenderer.on(BENCH_SAMPLE_CHANNEL, handler)
    return () => ipcRenderer.removeListener(BENCH_SAMPLE_CHANNEL, handler)
  }
}

contextBridge.exposeInMainWorld('pitrig', debugApi)
