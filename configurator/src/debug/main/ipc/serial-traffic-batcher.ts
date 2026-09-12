import { broadcastToWindows } from '@main/ipc/broadcast'
import { SERIAL_TRAFFIC_CHANNEL } from '@debug-shared/debug-channels'
import type { SerialTrafficLog } from '@shared/serial-traffic'

const MAXIMUM_PENDING_TRAFFIC = 4_000
const RETAINED_TRAFFIC = 2_000
const FLUSH_MS = 100

export class SerialTrafficBatcher {
  private readonly pending: SerialTrafficLog[] = []
  private timer: ReturnType<typeof setTimeout> | undefined

  readonly push = (log: SerialTrafficLog): void => {
    this.pending.push(log)
    if (this.pending.length > MAXIMUM_PENDING_TRAFFIC) {
      this.pending.splice(0, this.pending.length - RETAINED_TRAFFIC)
    }
    this.timer ??= setTimeout(() => {
      this.timer = undefined
      broadcastToWindows(SERIAL_TRAFFIC_CHANNEL, this.pending.splice(0))
    }, FLUSH_MS)
  }

  dispose(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.pending.length = 0
  }
}
