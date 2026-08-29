import { CONFIGURATION_DOCUMENT_IDS } from '../../shared/configuration-schema'
import type { DeviceInfo } from '../../shared/device'
import type { ConnectionManager } from './device-connection'
import { success } from './device-errors'
import type { OperationRunner } from './device-operation'
import { parseDeviceInfo } from './protocol-parsers'
import { requestResponse } from './serial-request'
import { readConfiguration } from './simcore-protocol'

const HEARTBEAT_INTERVAL_MS = 5_000
const HEARTBEAT_TIMEOUT_MS = 1_500
const INFO_REQUEST = '\n@SC:INFO\n'
const INFO_PREFIX = '@SC:OK:INFO:'

export class DeviceHeartbeat {
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly connection: ConnectionManager,
    private readonly runner: OperationRunner
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick()
    }, HEARTBEAT_INTERVAL_MS)
    this.timer.unref()
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  private async tick(): Promise<void> {
    if (this.skip()) return
    await this.runner.run(async ({ port, session, traffic }) => {
      const onTraffic = this.runner.operationTraffic(traffic)
      const line = await requestResponse(
        port,
        INFO_REQUEST,
        INFO_PREFIX,
        HEARTBEAT_TIMEOUT_MS,
        onTraffic,
        'serial_error'
      )
      const info = parseDeviceInfo(line)
      if (storedKey(session.info) === storedKey(info) && sameHealth(session.info, info)) {
        return success(false)
      }
      const configuration =
        storedKey(session.info) === storedKey(info)
          ? session.configuration
          : await readConfiguration(port, info.boardId, onTraffic)
      if (this.connection.port !== port || this.connection.getState().session !== session) {
        return success(false)
      }
      this.connection.setState({
        ...this.connection.getState(),
        session: { ...session, info, configuration }
      })
      return success(true)
    })
  }

  private skip(): boolean {
    const state = this.connection.getState()
    return (
      state.status !== 'connected' ||
      state.session === undefined ||
      this.runner.operationActive ||
      this.runner.inPipeline ||
      this.connection.isTransitioning() ||
      this.connection.port?.isOpen !== true
    )
  }
}

function storedKey(info: DeviceInfo): string {
  return CONFIGURATION_DOCUMENT_IDS.map(
    (id) => `${id}=${info.documents[id].outcome}:${info.documents[id].generation}`
  ).join(',')
}

function sameHealth(left: DeviceInfo, right: DeviceInfo): boolean {
  return (
    left.firmwareVersion === right.firmwareVersion &&
    left.storageAvailable === right.storageAvailable &&
    JSON.stringify(left.health ?? null) === JSON.stringify(right.health ?? null)
  )
}
