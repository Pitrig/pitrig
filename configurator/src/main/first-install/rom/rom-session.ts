import { setTimeout as sleep } from 'node:timers/promises'

import type { SerialPort } from 'serialport'

import { InstallFailure } from '../install-failure'
import { commandPacket, parseResponse, RomCommand, SYNC_PAYLOAD, words } from './rom-commands'
import { encodeSlip, SlipDecoder } from './slip'

export const DEFAULT_TIMEOUT_MS = 3_000
const SYNC_TIMEOUT_MS = 100

export class RomTimeout extends Error {
  constructor(readonly op: number) {
    super(`ROM command 0x${op.toString(16)} timed out`)
  }
}

export class RomRejected extends Error {
  constructor(
    readonly op: number,
    readonly reason: number
  ) {
    super(`ROM command 0x${op.toString(16)} failed with 0x${reason.toString(16)}`)
  }
}

export class RomPortClosed extends Error {
  constructor() {
    super('The serial port closed')
  }
}

export interface CommandOptions {
  check?: number
  timeoutMs?: number
  responseLength?: number
  ignoreStatus?: boolean
}

export interface RomReply {
  value: number
  data: Buffer
}

export class RomSession {
  private readonly frames: Buffer[] = []
  private readonly decoder = new SlipDecoder((frame) => this.receive(frame))
  private wake: (() => void) | undefined
  private closed = false
  private readonly onData = (chunk: Buffer): void => this.decoder.push(chunk)
  private readonly onClose = (): void => {
    this.closed = true
    this.wake?.()
  }

  constructor(
    readonly port: SerialPort,
    private readonly signal: AbortSignal
  ) {
    port.on('data', this.onData)
    port.on('close', this.onClose)
  }

  dispose(): void {
    this.port.off('data', this.onData)
    this.port.off('close', this.onClose)
  }

  async command(op: number, data: Uint8Array, options: CommandOptions = {}): Promise<RomReply> {
    const responseLength = options.responseLength ?? 0
    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    await this.write(encodeSlip(commandPacket(op, data, options.check ?? 0)))
    for (;;) {
      const response = parseResponse(await this.nextFrame(op, deadline))
      if (!response || response.op !== op) continue
      if (options.ignoreStatus) return { value: response.value >>> 0, data: response.data }
      const status = response.data[responseLength]
      if (status === undefined) throw new RomRejected(op, 0)
      if (status !== 0) throw new RomRejected(op, response.data[responseLength + 1] ?? 0)
      return { value: response.value >>> 0, data: response.data.subarray(0, responseLength) }
    }
  }

  async sync(): Promise<boolean> {
    this.discard()
    try {
      await this.command(RomCommand.sync, SYNC_PAYLOAD, {
        timeoutMs: SYNC_TIMEOUT_MS,
        ignoreStatus: true
      })
    } catch (error) {
      if (error instanceof RomTimeout) return false
      throw error
    }
    await this.pause(SYNC_TIMEOUT_MS)
    this.discard()
    return true
  }

  async readRegister(address: number): Promise<number> {
    return (await this.command(RomCommand.readRegister, words(address))).value
  }

  async writeRegister(address: number, value: number, mask = 0xffffffff): Promise<void> {
    await this.command(RomCommand.writeRegister, words(address, value, mask, 0))
  }

  async changeBaudRate(baudRate: number): Promise<void> {
    await this.command(RomCommand.changeBaudRate, words(baudRate, 0))
    await new Promise<void>((resolve, reject) =>
      this.port.update({ baudRate }, (error) => (error ? reject(error) : resolve()))
    )
    await this.pause(50)
    this.discard()
  }

  discard(): void {
    this.frames.length = 0
    this.decoder.reset()
  }

  async pause(milliseconds: number): Promise<void> {
    await sleep(milliseconds, undefined, { signal: this.signal }).catch(() => undefined)
    this.ensureActive()
  }

  ensureActive(): void {
    if (this.signal.aborted) throw new InstallFailure('cancelled')
  }

  private receive(frame: Buffer): void {
    this.frames.push(frame)
    this.wake?.()
  }

  private async nextFrame(op: number, deadline: number): Promise<Buffer> {
    for (;;) {
      this.ensureActive()
      const frame = this.frames.shift()
      if (frame) return frame
      if (this.closed) throw new RomPortClosed()
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new RomTimeout(op)
      await this.waitForFrame(remaining)
    }
  }

  private waitForFrame(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        clearTimeout(timer)
        this.signal.removeEventListener('abort', finish)
        if (this.wake === finish) this.wake = undefined
        resolve()
      }
      const timer = setTimeout(finish, milliseconds)
      this.signal.addEventListener('abort', finish, { once: true })
      this.wake = finish
    })
  }

  private write(data: Buffer): Promise<void> {
    this.ensureActive()
    if (this.closed) return Promise.reject(new RomPortClosed())
    return new Promise((resolve, reject) => {
      this.port.write(data, (error) => {
        if (error) reject(error)
      })
      this.port.drain((error) => (error ? reject(error) : resolve()))
    })
  }
}
