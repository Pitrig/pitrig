import type { DeviceResult } from '../../shared/device'
import { failure, success, toDeviceError } from './device-errors'
import type { ConnectionManager, OpenedDevice } from './device-connection'
import type { SerialTrafficReporter } from './serial-traffic-reporter'

/**
 * The one-at-a-time discipline every device command runs under.
 *
 * Every command is the same shape: take the connected device, hold the
 * operation lock, do the work, release the lock whatever happens, and report a
 * failure as a DeviceError rather than a thrown one. Seven commands spelled
 * that out in full, which was seven chances to leave the lock held.
 */
export class OperationRunner {
  private deviceOperationActive = false
  /**
   * Held for a whole save-to-board pipeline, which is several device commands
   * with the author's document riding on all of them. `deviceOperationActive`
   * is released between each of those, and live apply is automatic — without
   * this, a debounced apply lands between the font upload and the save.
   */
  private pipelineActive = false

  constructor(private readonly connection: ConnectionManager) {}

  get operationActive(): boolean {
    return this.deviceOperationActive
  }

  get inPipeline(): boolean {
    return this.pipelineActive
  }

  async run<T>(work: (device: OpenedDevice) => Promise<DeviceResult<T>>): Promise<DeviceResult<T>> {
    const active = this.getActiveDevice()
    if (!active.ok) return failure(active.error)
    this.deviceOperationActive = true
    try {
      return await work(active.value)
    } catch (error) {
      return failure(toDeviceError(error))
    } finally {
      this.deviceOperationActive = false
    }
  }

  /**
   * The lock alone, for the two commands whose work is not the runOperation
   * shape: a reboot forgets the port halfway through, and an upload reports
   * progress instead of returning a DeviceResult.
   */
  async withLock<T>(work: () => Promise<T>): Promise<T> {
    this.deviceOperationActive = true
    try {
      return await work()
    } finally {
      this.deviceOperationActive = false
    }
  }

  /**
   * Runs a multi-command sequence with every other device caller locked out.
   * Nested single commands still take `deviceOperationActive` for themselves;
   * this only keeps anything *else* from getting in between them.
   */
  async runPipeline<T>(work: () => Promise<T>): Promise<T> {
    this.pipelineActive = true
    try {
      return await work()
    } finally {
      this.pipelineActive = false
    }
  }

  getActiveDevice(): DeviceResult<OpenedDevice> {
    const port = this.connection.port
    const session = this.connection.getState().session
    const traffic = this.connection.traffic
    if (!port?.isOpen || !session || !traffic) {
      return failure({ code: 'serial_error', message: 'No SimCore device is connected.' })
    }
    if (this.deviceOperationActive) {
      return failure({ code: 'busy', message: 'Another device operation is already running.' })
    }
    return success({ port, session, traffic })
  }

  operationTraffic(traffic: SerialTrafficReporter): (direction: 'rx' | 'tx', data: string) => void {
    return (direction, data) => {
      // RX is observed by the listener attached for the active connection.
      if (direction === 'tx') traffic.write(direction, data)
    }
  }
}
