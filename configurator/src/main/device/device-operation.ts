import { AsyncLocalStorage } from 'node:async_hooks'

import type { DeviceResult } from '../../shared/device'
import { failure, success, toDeviceError } from './device-errors'
import type { ConnectionManager, OpenedDevice } from './device-connection'
import type { SerialTrafficReporter } from './serial-traffic-reporter'
import { t } from '@shared/ui-text'

export class OperationRunner {
  private deviceOperationActive = false
  private pipelineActive = false
  private readonly pipelineScope = new AsyncLocalStorage<true>()

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

  async withLock<T>(work: () => Promise<T>): Promise<T> {
    this.deviceOperationActive = true
    try {
      return await work()
    } finally {
      this.deviceOperationActive = false
    }
  }

  async runPipeline<T>(work: () => Promise<T>): Promise<T> {
    this.pipelineActive = true
    try {
      return await this.pipelineScope.run(true, work)
    } finally {
      this.pipelineActive = false
    }
  }

  getActiveDevice(): DeviceResult<OpenedDevice> {
    const port = this.connection.port
    const session = this.connection.getState().session
    const traffic = this.connection.traffic
    if (!port?.isOpen || !session || !traffic) {
      return failure({ code: 'serial_error', message: t('device.deviceOperation.noPitrigDeviceIsConnected') })
    }
    if (this.deviceOperationActive) {
      return failure({ code: 'busy', message: t('device.deviceOperation.anotherDeviceOperationIsAlready') })
    }
    if (this.pipelineActive && this.pipelineScope.getStore() === undefined) {
      return failure({
        code: 'busy',
        message: t('device.deviceOperation.theBoardIsBusyWith')
      })
    }
    return success({ port, session, traffic })
  }

  operationTraffic(traffic: SerialTrafficReporter): (direction: 'rx' | 'tx', data: string) => void {
    return (direction, data) => {
      if (direction === 'tx') traffic.write(direction, data)
    }
  }
}
