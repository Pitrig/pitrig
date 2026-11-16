import { app, ipcMain } from 'electron'
import { join } from 'node:path'

import type { DeviceState } from '../../shared/device'
import type { SaveProgress } from '../../shared/save-to-board'
import {
  USAGE_GET_CHANNEL,
  USAGE_SET_CHANNEL,
  type UsageSetRequest,
  type UsageSettings
} from '../../shared/usage'
import type { TelemetryBridgeService } from '../telemetry-bridge/bridge-service'
import { UsageReporter } from './usage-reporter'
import { UsageStore } from './usage-store'

const LAUNCH_INTERVAL_MS = 6 * 60 * 60 * 1000
const BRIDGE_POLL_MS = 10 * 60 * 1000
const FIRST_REPORT_DELAY_MS = 15_000

export interface UsageTracker {
  observeDevice: (state: DeviceState) => void
  observeSave: (progress: SaveProgress) => void
  start: (bridge: TelemetryBridgeService) => void
}

export function registerUsage(): UsageTracker {
  const store = new UsageStore(join(app.getPath('userData'), 'usage.json'))
  const reporter = new UsageReporter(store)
  const firmware = new Map<string, string>()

  const settings = async (): Promise<UsageSettings> => ({
    active: reporter.active,
    enabled: (await store.read())?.enabled ?? false
  })
  ipcMain.handle(USAGE_GET_CHANNEL, settings)
  ipcMain.handle(USAGE_SET_CHANNEL, async (_event, request: unknown) => {
    const enabled = (request as Partial<UsageSetRequest> | null)?.enabled
    if (typeof enabled === 'boolean') await store.setEnabled(enabled)
    return settings()
  })

  app.on('render-process-gone', (_event, _contents, details) => {
    if (details.reason !== 'clean-exit') void reporter.report('crash', undefined, `renderer:${details.reason}`)
  })
  app.on('child-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') {
      void reporter.report('crash', undefined, `${details.type}:${details.reason}`.replace(/\s+/g, '-'))
    }
  })

  return {
    observeDevice(state) {
      const info = state.session?.info
      if (!info) return
      const known = firmware.get(info.boardId)
      firmware.set(info.boardId, info.firmwareVersion)
      void reporter.report('board', info.boardId, info.firmwareVersion)
      if (known !== undefined && known !== info.firmwareVersion) {
        void reporter.report('firmware', info.boardId, info.firmwareVersion)
      }
    },
    observeSave(progress) {
      if (progress.stage === 'completed') void reporter.report('save')
    },
    start(bridge) {
      const tick = (): void => {
        const status = bridge.getStatus()
        if (status.receiving) void reporter.report('bridge', undefined, status.plugin?.version)
      }
      setTimeout(() => {
        void reporter.report('launch')
        tick()
      }, FIRST_REPORT_DELAY_MS).unref()
      setInterval(() => void reporter.report('launch'), LAUNCH_INTERVAL_MS).unref()
      setInterval(tick, BRIDGE_POLL_MS).unref()
    }
  }
}
