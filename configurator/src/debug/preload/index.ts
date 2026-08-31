import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import { productApi } from '../../preload/api'
import {
  BENCH_APPLY_PATTERN_CHANNEL,
  BENCH_GET_STATUS_CHANNEL,
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
import type { SimCoreDebugApi } from '../shared/debug-ipc'
import { FIRMWARE_REGISTER_SOURCE_CHANNEL } from '../../shared/firmware-update'
import type { SerialTrafficLog } from '../../shared/serial-traffic'

const debugApi: SimCoreDebugApi = {
  ...productApi,
  sendControlCommand: (request) => ipcRenderer.invoke(CONTROL_COMMAND_CHANNEL, request),
  registerFirmwareSource: (request) =>
    ipcRenderer.invoke(FIRMWARE_REGISTER_SOURCE_CHANNEL, request),
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

contextBridge.exposeInMainWorld('simcore', debugApi)
