import { CONFIGURATION_DOCUMENT_IDS } from '../../shared/configuration-schema'
import type { DeviceInfo, DeviceResult } from '../../shared/device'
import type { ConnectionManager } from './device-connection'
import { success } from './device-errors'
import type { LinkOwner } from './link-owner'
import { parseDeviceInfo } from './protocol-parsers'
import { requestResponse } from './serial-request'
import { sentTraffic } from './serial-traffic-reporter'
import { readConfiguration } from './pitrig-protocol'
import { CONTROL_PREFIX } from '../../shared/control-protocol'

const HEARTBEAT_INTERVAL_MS = 5_000
const HEARTBEAT_TIMEOUT_MS = 1_500
const MAXIMUM_SKIPPED_TICKS = 11
const INFO_REQUEST = `${CONTROL_PREFIX}INFO\n`
const INFO_PREFIX = `${CONTROL_PREFIX}OK:INFO:`

export class DeviceHeartbeat {
  private timer: ReturnType<typeof setInterval> | undefined
  private failures = 0
  private skipped = 0
  private watched: unknown

  constructor(
    private readonly connection: ConnectionManager,
    private readonly owner: LinkOwner
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
    if (this.watched !== this.connection.port) {
      this.watched = this.connection.port
      this.failures = 0
      this.skipped = 0
    }
    if (this.skipped > 0) {
      this.skipped -= 1
      return
    }
    if (this.skip()) return
    const result = await this.owner.poll(async ({ port, session, traffic }, turn) => {
      const onTraffic = sentTraffic(traffic)
      const line = await requestResponse(
        port,
        INFO_REQUEST,
        INFO_PREFIX,
        HEARTBEAT_TIMEOUT_MS,
        onTraffic,
        'board_refused'
      )
      const info = parseDeviceInfo(line)
      const sameDocuments = storedKey(session.info) === storedKey(info)
      if (sameDocuments && sameHealth(session.info, info)) return success(false)
      const configuration = sameDocuments
        ? session.configuration
        : await readConfiguration(
            port,
            info.boardId,
            onTraffic,
            'configuration_rejected',
            () => turn.yielding
          )
      if (this.connection.port !== port || this.connection.getState().session !== session) {
        return success(false)
      }
      this.connection.setState({
        ...this.connection.getState(),
        session: { ...session, info, configuration }
      })
      return success(true)
    })
    this.settle(result)
  }

  private settle(result: DeviceResult<boolean> | undefined): void {
    if (result === undefined || (!result.ok && result.error.code === 'cancelled')) return
    if (result.ok) {
      this.failures = 0
      return
    }
    this.failures += 1
    this.skipped = Math.min(MAXIMUM_SKIPPED_TICKS, 2 ** this.failures - 1)
  }

  private skip(): boolean {
    const state = this.connection.getState()
    return (
      state.status !== 'connected' ||
      state.session === undefined ||
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
