import { setTimeout as sleep } from 'node:timers/promises'

import type { SerialPort } from 'serialport'

import type { PluginBoard } from '../../shared/telemetry-bridge'
import { DeviceServiceError, toDeviceError } from './device-errors'
import { openPort } from './serial-port-lifecycle'

const OPEN_ATTEMPTS = 5
const OPEN_RETRY_MS = 200
const PROBE_ATTEMPTS = 3
const PROBE_RETRY_MS = 1_000

export interface PortHandback {
  baudRate: number
}

export interface PortClaims {
  acquire: (path: string) => Promise<boolean>
  release: (path: string, handback?: PortHandback) => void
  pluginBoards: () => PluginBoard[]
}

export function samePort(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

export class PortLeases {
  private claims: PortClaims | undefined
  private readonly held = new Set<string>()

  attach(claims: PortClaims): void {
    this.claims = claims
  }

  async take(path: string): Promise<boolean> {
    this.held.add(path)
    return (await this.claims?.acquire(path)) ?? false
  }

  keepOnly(path: string): void {
    for (const held of [...this.held]) {
      if (held !== path) this.drop(held)
    }
  }

  handBack(path: string | undefined, baudRate: number | undefined): void {
    if (path !== undefined && baudRate !== undefined && this.held.delete(path)) {
      this.claims?.release(path, { baudRate })
    }
    this.dropAll()
  }

  dropAll(): void {
    for (const held of [...this.held]) this.drop(held)
  }

  pluginBoards(): PluginBoard[] {
    return this.claims?.pluginBoards() ?? []
  }

  private drop(path: string): void {
    if (this.held.delete(path)) this.claims?.release(path)
  }
}

export async function openWhenFree(port: SerialPort, fromPlugin: boolean): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await openPort(port)
      return
    } catch (error) {
      if (!fromPlugin || attempt >= OPEN_ATTEMPTS || toDeviceError(error).code !== 'port_busy') {
        throw error
      }
      await sleep(OPEN_RETRY_MS)
    }
  }
}

export async function probeAfterHandover<T>(
  probe: () => Promise<T>,
  fromPlugin: boolean
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await probe()
    } catch (error) {
      const retry =
        fromPlugin &&
        attempt < PROBE_ATTEMPTS &&
        error instanceof DeviceServiceError &&
        error.code === 'not_pitrig'
      if (!retry) throw error
      await sleep(PROBE_RETRY_MS)
    }
  }
}
