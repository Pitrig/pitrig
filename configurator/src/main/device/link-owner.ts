import { AsyncLocalStorage } from 'node:async_hooks'

import type { SerialPort } from 'serialport'

import type { DeviceActivity, DeviceError, DeviceResult } from '../../shared/device'
import { failure, success, toDeviceError } from './device-errors'
import type { ConnectionManager, OpenedDevice } from './device-connection'
import { t } from '@shared/ui-text'

const TELEMETRY_SETTLE_MS = 1_000

interface Turn {
  readonly kind: 'poll' | 'command' | 'operation' | 'step'
  readonly parent?: Turn
  steps?: Promise<unknown>
  done?: boolean
}

interface Waiting {
  readonly turn: Turn
  readonly grant: () => void
}

export interface PollTurn {
  readonly yielding: boolean
}

type DeviceWork<T> = (device: OpenedDevice) => Promise<DeviceResult<T>>

export class LinkOwner {
  private holder: Turn | undefined
  private accepted: DeviceActivity | undefined
  private readonly queue: Waiting[] = []
  private readonly polls: Waiting[] = []
  private readonly idle: (() => void)[] = []
  private readonly scope = new AsyncLocalStorage<Turn>()
  private telemetryWrites = 0
  private readonly telemetryWaiters: (() => void)[] = []

  constructor(private readonly connection: ConnectionManager) {}

  get activity(): DeviceActivity | undefined {
    return this.accepted
  }

  get free(): boolean {
    return this.holder === undefined && this.queue.length === 0 && this.accepted === undefined
  }

  async poll<T>(
    work: (device: OpenedDevice, turn: PollTurn) => Promise<DeviceResult<T>>
  ): Promise<DeviceResult<T> | undefined> {
    if (this.accepted !== undefined || this.queue.length > 0) return undefined
    if (this.holder !== undefined && this.holder.kind !== 'poll') return undefined
    const turn: Turn = { kind: 'poll' }
    await this.enter(turn, this.polls)
    try {
      await this.telemetrySettled()
      const wanted = (): boolean => this.queue.length > 0 || this.accepted !== undefined
      const progress: PollTurn = {
        get yielding(): boolean {
          return wanted()
        }
      }
      return await this.scope.run(turn, () => this.attempt((device) => work(device, progress)))
    } finally {
      await this.settle(turn)
      this.leave(turn)
    }
  }

  async command<T>(work: DeviceWork<T>): Promise<DeviceResult<T>> {
    const parent = this.ownScope()
    if (parent) return this.step(parent, () => this.attempt(work))
    if (this.accepted !== undefined) return failure(this.busyWith(this.accepted))
    const turn: Turn = { kind: 'command' }
    await this.enter(turn, this.queue)
    try {
      await this.telemetrySettled()
      return await this.scope.run(turn, () => this.attempt(work))
    } finally {
      await this.settle(turn)
      this.leave(turn)
    }
  }

  async operation<T>(
    activity: DeviceActivity,
    work: () => Promise<T>,
    refused: (error: DeviceError) => T
  ): Promise<T> {
    const parent = this.ownScope()
    if (parent) return this.step(parent, work)
    if (this.accepted !== undefined) return refused(this.busyWith(this.accepted))
    const turn: Turn = { kind: 'operation' }
    this.accept(activity)
    try {
      await this.enter(turn, this.queue)
      await this.telemetrySettled()
      return await this.scope.run(turn, work)
    } finally {
      await this.settle(turn)
      this.leave(turn)
      this.accept(undefined)
    }
  }

  writeTelemetry(
    port: SerialPort,
    text: string | Uint8Array,
    onWritten?: (error?: Error) => void
  ): boolean {
    if (!this.free || !port.isOpen) return false
    this.telemetryWrites += 1
    port.write(text, (error) => {
      this.telemetryWrites -= 1
      if (this.telemetryWrites === 0) this.telemetryWaiters.splice(0).forEach((done) => done())
      onWritten?.(error ?? undefined)
    })
    return true
  }

  whenIdle(): Promise<void> {
    if (this.accepted === undefined) return Promise.resolve()
    return new Promise((resolve) => this.idle.push(resolve))
  }

  busyWith(activity: DeviceActivity): DeviceError {
    return { code: 'busy', message: t(`device.linkOwner.busy.${activity}`) }
  }

  private ownScope(): Turn | undefined {
    let live: Turn | undefined
    for (let turn = this.scope.getStore(); turn !== undefined; turn = turn.parent) {
      if (live === undefined && !turn.done) live = turn
      if (turn === this.holder) return live
    }
    return undefined
  }

  private step<T>(parent: Turn, work: () => Promise<T>): Promise<T> {
    const step: Turn = { kind: 'step', parent }
    const run = (parent.steps ?? Promise.resolve())
      .then(() => this.scope.run(step, work))
      .finally(() => this.settle(step))
    parent.steps = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async settle(turn: Turn): Promise<void> {
    turn.done = true
    await turn.steps
  }

  private enter(turn: Turn, line: Waiting[]): Promise<void> {
    return new Promise((grant) => {
      line.push({ turn, grant })
      this.advance()
    })
  }

  private leave(turn: Turn): void {
    if (this.holder !== turn) return
    this.holder = undefined
    this.advance()
  }

  private advance(): void {
    if (this.holder !== undefined) return
    const next = this.queue.shift() ?? this.polls.shift()
    if (!next) return
    this.holder = next.turn
    next.grant()
  }

  private accept(activity: DeviceActivity | undefined): void {
    this.accepted = activity
    this.connection.setActivity(activity)
    if (activity === undefined) this.idle.splice(0).forEach((done) => done())
  }

  private async attempt<T>(work: DeviceWork<T>): Promise<DeviceResult<T>> {
    const device = this.device()
    if (!device.ok) return failure(device.error)
    try {
      return await work(device.value)
    } catch (error) {
      return failure(toDeviceError(error))
    }
  }

  private device(): DeviceResult<OpenedDevice> {
    const port = this.connection.port
    const session = this.connection.getState().session
    const traffic = this.connection.traffic
    if (!port?.isOpen || !session || !traffic) {
      return failure({
        code: 'serial_error',
        message: t('device.deviceOperation.noPitrigDeviceIsConnected')
      })
    }
    return success({ port, session, traffic })
  }

  private telemetrySettled(): Promise<void> {
    if (this.telemetryWrites === 0) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, TELEMETRY_SETTLE_MS)
      this.telemetryWaiters.push(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
