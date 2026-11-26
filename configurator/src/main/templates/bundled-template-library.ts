import { readFile } from 'node:fs/promises'

import { emptyOpenReport, type OpenedDashboard } from '../../shared/dashboard-files'
import type { PreviewImageAsset } from '../../shared/preview-assets'
import {
  TEMPLATE_FORMAT,
  TEMPLATE_FORMAT_VERSION,
  type DashboardTemplateDocument,
  type DashboardTemplateSummary,
  type TemplateCredit,
  type TemplateReadValue,
  type TemplateResult,
  type TemplateVariant
} from '../../shared/templates'
import type { DashboardFileService } from '../dashboard-files/dashboard-file-service'
import { decodeDashboardFile } from '../dashboard-files/dashboard-file-format'
import { BUNDLED_TEMPLATE_SOURCES, type BundledTemplateSource } from './bundled-templates'
import { dashboardSummary, failure, messageOf, parseTemplateDocument } from './template-documents'
import { previewsOf } from './template-previews'
import { t } from '@shared/ui-text'

interface LoadedStarter {
  document: DashboardTemplateDocument
  previews: PreviewImageAsset[]
}

export class BundledTemplateLibrary {
  private readonly loaded = new Map<string, Promise<LoadedStarter>>()

  constructor(
    private readonly dashboardFiles: Pick<DashboardFileService, 'open'>,
    private readonly sources: readonly BundledTemplateSource[] = BUNDLED_TEMPLATE_SOURCES
  ) {}

  async list(): Promise<{ summaries: DashboardTemplateSummary[]; unreadable: number }> {
    const summaries: DashboardTemplateSummary[] = []
    let unreadable = 0
    for (const entry of this.sources) {
      if (!this.leads(entry)) continue
      try {
        const { document } = await this.load(entry)
        const variants = entry.variant ? await this.variantsOf(entry.variant.family) : undefined
        summaries.push({
          ...dashboardSummary(entry.id, 'bundled', document),
          ...(entry.credit ? { credit: entry.credit } : {}),
          ...(variants ? { variants } : {})
        })
      } catch {
        unreadable += 1
      }
    }
    return { summaries, unreadable }
  }

  private leads(entry: BundledTemplateSource): boolean {
    const family = entry.variant?.family
    if (family === undefined) return true
    return this.sources.find((other) => other.variant?.family === family) === entry
  }

  private async variantsOf(family: string): Promise<TemplateVariant[]> {
    const variants: TemplateVariant[] = []
    for (const entry of this.sources) {
      const variant = entry.variant
      if (!variant || variant.family !== family) continue
      const { document } = await this.load(entry)
      variants.push({
        id: entry.id,
        label: t(variant.label),
        name: document.name,
        ...(document.description ? { description: document.description } : {})
      })
    }
    return variants
  }

  async read(id: string): Promise<TemplateResult<TemplateReadValue>> {
    const entry = this.find(id)
    if (!entry) return missing(id)
    try {
      const { document, previews } = await this.load(entry)
      return { ok: true, value: previews.length > 0 ? { ...document, previews } : document }
    } catch (error) {
      return unreadable(error)
    }
  }

  async adopt(id: string): Promise<TemplateResult<OpenedDashboard>> {
    const entry = this.find(id)
    if (!entry) return missing(id)
    if ('source' in entry) {
      try {
        const { document } = await this.load(entry)
        return {
          ok: true,
          value: {
            name: document.name,
            ...(document.description ? { description: document.description } : {}),
            configuration: document.configuration,
            report: emptyOpenReport()
          }
        }
      } catch (error) {
        return unreadable(error)
      }
    }
    let bytes: Buffer
    try {
      bytes = await readFile(entry.file)
    } catch (error) {
      return failure(
        'read_failed',
        messageOf(error, t('templates.templateService.theStarterTemplateIsUnreadable'))
      )
    }
    const opened = await this.dashboardFiles.open(bytes)
    return opened.ok ? opened : failure('invalid_template', opened.error.message)
  }

  credit(id: string): TemplateCredit | undefined {
    return this.find(id)?.credit
  }

  private find(id: string): BundledTemplateSource | undefined {
    return this.sources.find((entry) => entry.id === id)
  }

  private load(entry: BundledTemplateSource): Promise<LoadedStarter> {
    let loaded = this.loaded.get(entry.id)
    if (!loaded) {
      loaded = loadStarter(entry)
      this.loaded.set(entry.id, loaded)
    }
    return loaded
  }
}

async function loadStarter(entry: BundledTemplateSource): Promise<LoadedStarter> {
  if ('source' in entry) return { document: parseTemplateDocument(entry.source), previews: [] }
  const content = await decodeDashboardFile(await readFile(entry.file))
  const document = parseTemplateDocument({
    format: TEMPLATE_FORMAT,
    format_version: TEMPLATE_FORMAT_VERSION,
    name: content.name,
    ...(content.description ? { description: content.description } : {}),
    configuration: content.configuration
  })
  return { document, previews: previewsOf(content) }
}

function missing(id: string): TemplateResult<never> {
  return failure('not_found', t('templates.templateService.noStarterTemplateNamedId', { id }))
}

function unreadable(error: unknown): TemplateResult<never> {
  return failure(
    'invalid_template',
    messageOf(error, t('templates.templateService.theStarterTemplateIsUnreadable'))
  )
}
