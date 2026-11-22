import type { BrowserWindow } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'

import {
  MAXIMUM_DASHBOARD_FILE_SIZE,
  emptyOpenReport,
  type DashboardShareSaveValue,
  type OpenedDashboard
} from '../../shared/dashboard-files'
import { freeAssetId } from '../../shared/document-assets'
import {
  MAXIMUM_USER_TEMPLATES,
  TEMPLATE_ID_PATTERN,
  isBundledTemplateId,
  templateIdFor,
  type DashboardTemplateSummary,
  type TemplateCredit,
  type TemplateDocument,
  type TemplateKind,
  type TemplateLibrary,
  type TemplateReadValue,
  type TemplateResult,
  type TemplateSaveRequest,
  type TemplateSummary,
  type WidgetTemplateSummary
} from '../../shared/templates'
import { isContainer } from '../dashboard-files/dashboard-file-container'
import {
  decodeDashboardFile,
  readDashboardFileHeader,
  templateOf,
  wrongTemplate
} from '../dashboard-files/dashboard-file-format'
import type { DashboardFileService } from '../dashboard-files/dashboard-file-service'
import { writeFileAtomic } from '../write-file-atomic'
import type { BundledTemplateLibrary } from './bundled-template-library'
import {
  carrierOf,
  documentFromFile,
  documentFromLegacy,
  documentFromRequest,
  draftOf,
  isDashboardDocument
} from './template-content'
import {
  failure,
  limitReached,
  messageOf,
  notFound,
  savedFailure,
  templateSummary
} from './template-documents'
import { TemplateFiles, type StoredTemplate } from './template-files'
import { migrateLegacyTemplates } from './template-migration'
import { previewsOf } from './template-previews'
import { t } from '@shared/ui-text'

const KINDS: readonly TemplateKind[] = ['dashboard', 'widget']

export class TemplateService {
  private readonly files: TemplateFiles
  private migration?: Promise<void>

  constructor(
    directory: string,
    private readonly bundled: BundledTemplateLibrary,
    private readonly dashboardFiles: DashboardFileService
  ) {
    this.files = new TemplateFiles(directory)
  }

  async list(): Promise<TemplateResult<TemplateLibrary>> {
    await this.ready()
    const starters = await this.bundled.list()
    let unreadable = starters.unreadable
    const dashboards: DashboardTemplateSummary[] = []
    const widgets: WidgetTemplateSummary[] = []
    for (const kind of KINDS) {
      for (const entry of await this.files.list(kind)) {
        try {
          const summary = templateSummary(entry.id, await this.documentOf(entry, kind))
          if (summary.kind === 'dashboard') dashboards.push(summary)
          else widgets.push(summary)
        } catch {
          unreadable += 1
        }
      }
    }
    dashboards.sort(byName)
    widgets.sort(byName)
    return {
      ok: true,
      value: { dashboards: [...starters.summaries, ...dashboards], widgets, unreadable }
    }
  }

  async read(id: string, kind: TemplateKind): Promise<TemplateResult<TemplateReadValue>> {
    if (kind === 'dashboard' && isBundledTemplateId(id)) return this.bundled.read(id)
    try {
      const entry = await this.find(id, kind)
      if (!entry) return notFound(id)
      const bytes = await this.files.read(entry, kind)
      if (entry.format === 'legacy') return { ok: true, value: documentFromLegacy(bytes, kind) }
      const content = await decodeDashboardFile(bytes)
      const document = documentFromFile(content, kind)
      const previews = previewsOf(content)
      return { ok: true, value: previews.length > 0 ? { ...document, previews } : document }
    } catch (error) {
      return savedFailure(id, error)
    }
  }

  async adopt(id: string, kind: TemplateKind): Promise<TemplateResult<OpenedDashboard>> {
    if (kind === 'dashboard' && isBundledTemplateId(id)) return this.bundled.adopt(id)
    try {
      const entry = await this.find(id, kind)
      if (!entry) return notFound(id)
      const bytes = await this.files.read(entry, kind)
      if (entry.format === 'file') {
        const opened = await this.dashboardFiles.open(bytes, kind)
        return opened.ok ? opened : failure('invalid_template', opened.error.message)
      }
      const document = documentFromLegacy(bytes, kind)
      return {
        ok: true,
        value: {
          name: document.name,
          ...(document.description ? { description: document.description } : {}),
          configuration: isDashboardDocument(document) ? document.configuration : carrierOf(document),
          report: emptyOpenReport()
        }
      }
    } catch (error) {
      return savedFailure(id, error)
    }
  }

  credit(id: string): TemplateCredit | undefined {
    return this.bundled.credit(id)
  }

  async save(request: TemplateSaveRequest): Promise<TemplateResult<TemplateSummary>> {
    const name = request.name.trim()
    const description = request.description?.trim()
    const id = templateIdFor(name)
    if (!id) {
      return failure('invalid_template', t('templates.templateService.aTemplateNameNeedsAt'))
    }
    let document: TemplateDocument
    try {
      document = documentFromRequest(request, name, description)
    } catch (error) {
      return failure(
        'invalid_template',
        messageOf(error, t('templates.templateService.thatCannotBeSavedAs'))
      )
    }
    try {
      await this.ready()
      const saved = await this.files.list(request.kind)
      if (!saved.some((entry) => entry.id === id) && saved.length >= MAXIMUM_USER_TEMPLATES) {
        return limitReached(request.kind)
      }
      const { bytes } = await this.dashboardFiles.encode(draftOf(document))
      await this.files.write(id, request.kind, bytes)
    } catch (error) {
      return failure(
        'write_failed',
        messageOf(error, t('templates.templateService.failedToWriteTheTemplate'))
      )
    }
    return { ok: true, value: templateSummary(id, document) }
  }

  async remove(id: string, kind: TemplateKind): Promise<TemplateResult<void>> {
    if (isBundledTemplateId(id)) {
      return failure('read_only', t('templates.templateService.aStarterTemplateCannotBe'))
    }
    try {
      await this.ready()
      if (!(await this.files.remove(id, kind))) return notFound(id)
      return { ok: true, value: undefined }
    } catch (error) {
      return failure(
        'write_failed',
        messageOf(error, t('templates.templateService.failedToDeleteTheTemplate'))
      )
    }
  }

  async share(
    id: string,
    kind: TemplateKind,
    owner?: BrowserWindow
  ): Promise<TemplateResult<DashboardShareSaveValue>> {
    try {
      const entry = await this.find(id, kind)
      if (!entry) return notFound(id)
      const stored = await this.files.read(entry, kind)
      const legacy = entry.format === 'legacy' ? documentFromLegacy(stored, kind) : undefined
      const name = legacy?.name ?? documentFromFile(await readDashboardFileHeader(stored), kind).name
      const encoded = legacy
        ? await this.dashboardFiles.encode(draftOf(legacy))
        : { bytes: stored, missingImages: [], missingFonts: [] }
      const title = kind === 'widget' ? t('share.dialog.saveWidgetTitle') : t('share.dialog.saveTitle')
      const path = await this.dashboardFiles.chooseSavePath(name, title, owner)
      if (!path) return { ok: true, value: { saved: false } }
      await writeFileAtomic(path, encoded.bytes)
      return {
        ok: true,
        value: {
          saved: true,
          fileName: basename(path),
          bytes: encoded.bytes.byteLength,
          missingImages: encoded.missingImages,
          missingFonts: encoded.missingFonts
        }
      }
    } catch (error) {
      return failure('write_failed', messageOf(error, t('share.errors.notSaved')))
    }
  }

  async importFile(
    kind: TemplateKind,
    owner?: BrowserWindow
  ): Promise<TemplateResult<TemplateSummary | null>> {
    const path = await this.dashboardFiles.chooseOpenPath(t('templates.files.openTitle'), owner)
    if (!path) return { ok: true, value: null }
    let bytes: Buffer
    let document: TemplateDocument
    try {
      const metadata = await stat(path)
      if (!metadata.isFile() || metadata.size > MAXIMUM_DASHBOARD_FILE_SIZE) {
        throw new Error(t('share.file.damaged'))
      }
      bytes = await readFile(path)
      if (!isContainer(bytes)) throw new Error(t('share.file.damaged'))
      const content = await decodeDashboardFile(bytes)
      if (templateOf(content) !== kind) throw new Error(wrongTemplate(templateOf(content)))
      try {
        document = documentFromFile(content, kind)
      } catch (error) {
        throw this.dashboardFiles.isNewer(content.createdWith)
          ? new Error(t('share.file.newerVersion', { version: content.createdWith?.app ?? '?' }))
          : error
      }
    } catch (error) {
      return failure('invalid_template', messageOf(error, t('share.file.damaged')))
    }
    try {
      await this.ready()
      const saved = await this.files.list(kind)
      if (saved.length >= MAXIMUM_USER_TEMPLATES) return limitReached(kind)
      const taken = new Set(saved.map((entry) => entry.id))
      const id = freeAssetId(
        templateIdFor(document.name) ?? kind,
        (candidate) => taken.has(candidate),
        TEMPLATE_ID_PATTERN
      )
      if (!id) return limitReached(kind)
      await this.files.write(id, kind, bytes)
      return { ok: true, value: templateSummary(id, document) }
    } catch (error) {
      return failure(
        'write_failed',
        messageOf(error, t('templates.templateService.failedToWriteTheTemplate'))
      )
    }
  }

  private async find(id: string, kind: TemplateKind): Promise<StoredTemplate | undefined> {
    await this.ready()
    return this.files.find(id, kind)
  }

  private async documentOf(entry: StoredTemplate, kind: TemplateKind): Promise<TemplateDocument> {
    const bytes = await this.files.read(entry, kind)
    return entry.format === 'file'
      ? documentFromFile(await readDashboardFileHeader(bytes), kind)
      : documentFromLegacy(bytes, kind)
  }

  private ready(): Promise<void> {
    this.migration ??= migrateLegacyTemplates(this.files, (draft) =>
      this.dashboardFiles.encode(draft)
    ).catch(() => undefined)
    return this.migration
  }
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name)
}
