import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

import {
  MAXIMUM_RECENT_CONFIGURATIONS,
  type RecentConfigurationEntry
} from '../../shared/config-library'

interface StoredEntry {
  path: string
  openedAt: number
}

export class RecentConfigurations {
  constructor(private readonly storePath: string) {}

  async list(): Promise<RecentConfigurationEntry[]> {
    const stored = await this.read()
    return Promise.all(
      stored.map(async (entry) => ({
        path: entry.path,
        fileName: basename(entry.path),
        openedAt: entry.openedAt,
        missing: !(await isReadableFile(entry.path))
      }))
    )
  }

  async record(path: string): Promise<void> {
    const stored = await this.read()
    const next = [
      { path, openedAt: Date.now() },
      ...stored.filter((entry) => entry.path !== path)
    ].slice(0, MAXIMUM_RECENT_CONFIGURATIONS)
    await this.write(next)
  }

  async forget(path: string): Promise<void> {
    await this.write((await this.read()).filter((entry) => entry.path !== path))
  }

  private async read(): Promise<StoredEntry[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.storePath, 'utf8'))
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isStoredEntry).slice(0, MAXIMUM_RECENT_CONFIGURATIONS)
    } catch {
      return []
    }
  }

  private async write(entries: StoredEntry[]): Promise<void> {
    try {
      await mkdir(dirname(this.storePath), { recursive: true })
      await writeFile(this.storePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
    } catch {
    }
  }
}

function isStoredEntry(value: unknown): value is StoredEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.path === 'string' && typeof entry.openedAt === 'number'
}

async function isReadableFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}
