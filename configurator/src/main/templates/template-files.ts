import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { DASHBOARD_FILE_EXTENSION, MAXIMUM_DASHBOARD_FILE_SIZE } from '../../shared/dashboard-files'
import {
  MAXIMUM_TEMPLATE_FILE_SIZE,
  TEMPLATE_ID_PATTERN,
  WIDGET_TEMPLATE_SUBDIRECTORY,
  type TemplateKind
} from '../../shared/templates'
import { writeFileAtomic } from '../write-file-atomic'
import { isMissing } from './template-documents'
import { t } from '@shared/ui-text'

export type TemplateFileFormat = 'file' | 'legacy'

export interface StoredTemplate {
  id: string
  format: TemplateFileFormat
  modifiedMs: number
}

const FORMATS: readonly TemplateFileFormat[] = ['file', 'legacy']
const EXTENSIONS: Readonly<Record<TemplateFileFormat, string>> = {
  file: `.${DASHBOARD_FILE_EXTENSION}`,
  legacy: '.json'
}
const LIMITS: Readonly<Record<TemplateFileFormat, number>> = {
  file: MAXIMUM_DASHBOARD_FILE_SIZE,
  legacy: MAXIMUM_TEMPLATE_FILE_SIZE
}

export class TemplateFiles {
  constructor(private readonly root: string) {}

  async stored(kind: TemplateKind): Promise<StoredTemplate[]> {
    let names: string[]
    try {
      names = await readdir(this.directory(kind))
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
    const stored: StoredTemplate[] = []
    for (const format of FORMATS) {
      const extension = EXTENSIONS[format]
      for (const name of names) {
        if (!name.endsWith(extension)) continue
        const id = name.slice(0, -extension.length)
        try {
          const metadata = await stat(this.path(id, kind, format))
          if (metadata.isFile()) stored.push({ id, format, modifiedMs: metadata.mtimeMs })
        } catch {
          stored.push({ id, format, modifiedMs: 0 })
        }
      }
    }
    return stored
  }

  async list(kind: TemplateKind): Promise<StoredTemplate[]> {
    const current = new Map<string, StoredTemplate>()
    for (const entry of await this.stored(kind)) {
      if (!current.has(entry.id)) current.set(entry.id, entry)
    }
    return [...current.values()]
  }

  async find(id: string, kind: TemplateKind): Promise<StoredTemplate | undefined> {
    return (await this.list(kind)).find((entry) => entry.id === id)
  }

  async read(entry: StoredTemplate, kind: TemplateKind): Promise<Buffer> {
    const path = this.path(entry.id, kind, entry.format)
    const metadata = await stat(path)
    if (!metadata.isFile() || metadata.size > LIMITS[entry.format]) {
      throw new Error(
        t('templates.templateService.aTemplateFileMustNot', { maximum: LIMITS[entry.format] })
      )
    }
    return readFile(path)
  }

  async write(id: string, kind: TemplateKind, bytes: Buffer): Promise<void> {
    await mkdir(this.directory(kind), { recursive: true })
    await writeFileAtomic(this.path(id, kind, 'file'), bytes)
    await this.removeFormat(id, kind, 'legacy')
  }

  async remove(id: string, kind: TemplateKind): Promise<boolean> {
    let removed = false
    for (const format of FORMATS) {
      if (await this.removeFormat(id, kind, format)) removed = true
    }
    return removed
  }

  async removeFormat(id: string, kind: TemplateKind, format: TemplateFileFormat): Promise<boolean> {
    try {
      await rm(this.path(id, kind, format))
      return true
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  private directory(kind: TemplateKind): string {
    return kind === 'dashboard' ? this.root : join(this.root, WIDGET_TEMPLATE_SUBDIRECTORY)
  }

  private path(id: string, kind: TemplateKind, format: TemplateFileFormat): string {
    const fileName = `${id}${EXTENSIONS[format]}`
    const path = join(this.directory(kind), fileName)
    if (!TEMPLATE_ID_PATTERN.test(id) || basename(path) !== fileName) {
      throw new Error(t('templates.templateService.idIsNotAValid', { id }))
    }
    return path
  }
}
