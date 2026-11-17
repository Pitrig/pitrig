import { app, net } from 'electron'

import type { UsageEvent, UsageReport } from '../../shared/usage'
import type { UsageStore } from './usage-store'

const DEFAULT_ENDPOINT = 'https://www.pitrig.com/api/app'
const SEND_TIMEOUT_MS = 10_000

export class UsageReporter {
  private readonly endpoint = process.env.PITRIG_USAGE_URL ?? DEFAULT_ENDPOINT
  readonly active =
    (app.isPackaged && __PITRIG_OFFICIAL_BUILD__) || process.env.PITRIG_USAGE_URL !== undefined
  private readonly sent = new Set<string>()
  private existing: Promise<boolean | undefined> | undefined

  constructor(private readonly store: UsageStore) {}

  async report(event: UsageEvent, board?: string, detail?: string): Promise<void> {
    if (!this.active) return
    const day = new Date().toISOString().slice(0, 10)
    const key = [event, board ?? '', detail ?? '', day].join(':')
    if (this.sent.has(key)) return
    this.sent.add(key)
    const state = await this.store.read()
    if (!state?.enabled) {
      this.sent.delete(key)
      return
    }
    this.existing ??= this.store.existedBefore()
    const existing = await this.existing
    const report: UsageReport = {
      install: state.install,
      event,
      version: app.getVersion(),
      os: process.platform,
      arch: process.arch,
      ...(existing === undefined ? {} : { existing }),
      ...(board ? { board } : {}),
      ...(detail ? { detail: detail.slice(0, 48) } : {})
    }
    try {
      await net.fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `Pitrig-Configurator/${app.getVersion()}`
        },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
      })
    } catch {
      this.sent.delete(key)
    }
  }
}
