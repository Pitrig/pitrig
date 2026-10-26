import { performance } from 'node:perf_hooks'

import {
  MAXIMUM_INPUT_BUTTONS,
  MAXIMUM_INPUT_SOURCES,
  MAXIMUM_SWITCH_POSITIONS,
  type InputSource,
  type InputsConfiguration
} from '@shared/configuration-schema'
import {
  PLUGIN_SILENCE_MS,
  type PluginBoard,
  type PluginStatus
} from '@shared/telemetry-bridge'
import { samePort, type PortClaims, type PortHandback } from '../device/port-leases'

const ACQUIRE_TIMEOUT_MS = 3_000
const RELEASE_REPEAT_MS = 3_000

interface PendingRelease {
  line: string
  until: number
}

export class PluginHandover implements PortClaims {
  private readonly holds = new Set<string>()
  private readonly releases = new Map<string, PendingRelease>()
  private readonly waiters = new Set<() => void>()
  private sequence = 0
  private status: PluginStatus | undefined
  private statusAt = Number.NEGATIVE_INFINITY
  private fields = ''
  private running = ''
  private inputs = false
  private wiring: string[] = []
  private control = true

  constructor(private readonly requestNow: () => void) {}

  setControl(enabled: boolean): void {
    this.control = enabled
  }

  setInterest(fields: string, running: string): boolean {
    const changed = fields !== this.fields || running !== this.running
    this.fields = fields
    this.running = running
    return changed
  }

  setInputs(inputs: boolean, wiring: InputsConfiguration | null): boolean {
    const lines = wiringLines(wiring)
    const changed = inputs !== this.inputs || lines.join('\n') !== this.wiring.join('\n')
    this.inputs = inputs
    this.wiring = lines
    return changed
  }

  payload(): string {
    const now = performance.now()
    const lines = [`seq=${this.sequence}`, `fields=${this.fields}`]
    if (this.control) {
      if (this.inputs) lines.push('inputs=1')
      for (const path of this.holds) lines.push(`hold=${path}`)
      if (this.holds.size > 0) lines.push(...this.wiring)
      for (const [key, release] of this.releases) {
        if (release.until < now) this.releases.delete(key)
        else lines.push(release.line)
      }
    }
    return `${lines.join('\n')}\n`
  }

  receive(status: PluginStatus): void {
    this.status = status
    this.statusAt = performance.now()
    for (const waiter of [...this.waiters]) waiter()
  }

  pluginStatus(): PluginStatus | undefined {
    return this.alive() ? this.status : undefined
  }

  pluginBoards(): PluginBoard[] {
    return this.pluginStatus()?.boards ?? []
  }

  async acquire(path: string): Promise<boolean> {
    const fromPlugin = this.pluginBoards().some((board) => samePort(board.path, path))
    this.holds.add(path)
    this.releases.delete(path.toLowerCase())
    if (!this.control || !this.alive()) return false
    const wanted = ++this.sequence
    this.requestNow()
    await this.waitFor(
      (status) =>
        status.acknowledged >= wanted && !status.boards.some((board) => samePort(board.path, path)),
      ACQUIRE_TIMEOUT_MS
    )
    return fromPlugin
  }

  release(path: string, handback?: PortHandback): void {
    if (!this.holds.delete(path)) return
    this.sequence += 1
    if (handback && this.control) {
      this.releases.set(path.toLowerCase(), {
        line: `release=${path}@${handback.baudRate}:${this.running}`,
        until: performance.now() + RELEASE_REPEAT_MS
      })
    }
    this.requestNow()
  }

  private alive(): boolean {
    return performance.now() - this.statusAt < PLUGIN_SILENCE_MS
  }

  private waitFor(done: (status: PluginStatus) => boolean, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        clearTimeout(timer)
        this.waiters.delete(check)
        resolve()
      }
      const check = (): void => {
        if (this.status && done(this.status)) finish()
      }
      const timer = setTimeout(finish, timeoutMs)
      this.waiters.add(check)
      check()
    })
  }
}

function wiringLines(wiring: InputsConfiguration | null): string[] {
  if (!wiring) return []
  const lines = ['wiring=1']
  const buttons = Array.isArray(wiring.buttons) ? wiring.buttons : []
  for (const [index, button] of buttons.slice(0, MAXIMUM_INPUT_BUTTONS).entries()) {
    for (const id of sourceIds(button?.sources, MAXIMUM_INPUT_SOURCES)) {
      if (id) lines.push(`button=${index + 1}:${id}`)
    }
  }
  for (const [index, id] of sourceIds(wiring.switch?.positions, MAXIMUM_SWITCH_POSITIONS).entries()) {
    if (id) lines.push(`position=${index + 1}:${id}`)
  }
  return lines
}

function sourceIds(sources: InputSource[] | undefined, limit: number): string[] {
  if (!Array.isArray(sources)) return []
  return sources
    .slice(0, limit)
    .map((source) => (typeof source?.id === 'string' ? source.id.replace(/[\r\n]/g, '') : ''))
}
