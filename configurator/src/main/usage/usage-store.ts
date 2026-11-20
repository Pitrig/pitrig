import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { writeFileAtomic } from '../write-file-atomic'

export interface UsageState {
  install: string
  enabled: boolean
}

const install = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const EARLIER_USE_MS = 10 * 60 * 1000

async function bornAt(path: string): Promise<number | undefined> {
  try {
    const { birthtimeMs } = await lstat(path)
    return birthtimeMs > 0 ? birthtimeMs : undefined
  } catch {
    return undefined
  }
}

function parse(text: string): UsageState | undefined {
  try {
    const value = JSON.parse(text) as Partial<UsageState> | null
    if (typeof value?.install !== 'string' || !install.test(value.install)) return undefined
    return { install: value.install, enabled: value.enabled !== false }
  } catch {
    return undefined
  }
}

function serialize(state: UsageState): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

export class UsageStore {
  private creating: Promise<UsageState | undefined> | undefined

  constructor(private readonly path: string) {}

  async read(): Promise<UsageState | undefined> {
    try {
      return parse(await readFile(this.path, 'utf8'))
    } catch (error) {
      if (!missing(error)) return undefined
      this.creating ??= this.create().finally(() => {
        this.creating = undefined
      })
      return this.creating
    }
  }

  async existedBefore(): Promise<boolean | undefined> {
    const created = await bornAt(this.path)
    if (created === undefined) return undefined
    const folder = dirname(this.path)
    const own = basename(this.path)
    const entries = await readdir(folder).catch((): string[] => [])
    const others = entries.filter((entry) => !entry.startsWith(own)).map((entry) => join(folder, entry))
    const births = (await Promise.all([folder, ...others].map(bornAt))).filter(
      (birth): birth is number => birth !== undefined
    )
    return births.length ? Math.min(...births) < created - EARLIER_USE_MS : undefined
  }

  async setEnabled(enabled: boolean): Promise<UsageState | undefined> {
    const next = { install: (await this.read())?.install ?? randomUUID(), enabled }
    try {
      await writeFileAtomic(this.path, serialize(next))
      return next
    } catch {
      return undefined
    }
  }

  private async create(): Promise<UsageState | undefined> {
    const created = { install: randomUUID(), enabled: true }
    try {
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(this.path, serialize(created), { flag: 'wx' })
      return created
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return undefined
      return parse(await readFile(this.path, 'utf8').catch(() => ''))
    }
  }
}
