import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import {
  MAXIMUM_TEMPLATE_FILE_SIZE,
  MAXIMUM_USER_TEMPLATES,
  TEMPLATE_FORMAT,
  TEMPLATE_FORMAT_VERSION,
  TEMPLATE_ID_PATTERN,
  WIDGET_TEMPLATE_FORMAT,
  WIDGET_TEMPLATE_SUBDIRECTORY,
  isBundledTemplateId,
  templateIdFor,
  type DashboardTemplateSummary,
  type TemplateDocument,
  type TemplateKind,
  type TemplateLibrary,
  type TemplateResult,
  type TemplateSaveRequest,
  type TemplateSummary,
  type WidgetTemplateSummary
} from '../../shared/templates'
import {
  dashboardSummary,
  failure,
  isMissing,
  messageOf,
  parseTemplateDocument,
  parseWidgetTemplateDocument,
  widgetSummary
} from './template-documents'
import { BUNDLED_TEMPLATE_SOURCES } from './bundled-templates'

const FILE_EXTENSION = '.json'

export class TemplateService {
  constructor(private readonly directory: string) {}

  private get widgetDirectory(): string {
    return join(this.directory, WIDGET_TEMPLATE_SUBDIRECTORY)
  }

  async list(): Promise<TemplateResult<TemplateLibrary>> {
    const bundled: DashboardTemplateSummary[] = []
    let unreadable = 0
    for (const entry of BUNDLED_TEMPLATE_SOURCES) {
      try {
        bundled.push(
          dashboardSummary(entry.id, 'bundled', parseTemplateDocument(entry.source))
        )
      } catch {
        unreadable += 1
      }
    }

    const dashboards: DashboardTemplateSummary[] = []
    for (const id of await this.savedIds('dashboard')) {
      if (!TEMPLATE_ID_PATTERN.test(id)) {
        unreadable += 1
        continue
      }
      try {
        const document = await this.readSaved(id, 'dashboard')
        if (document.format !== TEMPLATE_FORMAT) throw new Error('Not a dashboard template.')
        dashboards.push(dashboardSummary(id, 'user', document))
      } catch {
        unreadable += 1
      }
    }
    dashboards.sort((left, right) => left.name.localeCompare(right.name))

    const widgets: WidgetTemplateSummary[] = []
    for (const id of await this.savedIds('widget')) {
      if (!TEMPLATE_ID_PATTERN.test(id)) {
        unreadable += 1
        continue
      }
      try {
        widgets.push(widgetSummary(id, await this.readSaved(id, 'widget')))
      } catch {
        unreadable += 1
      }
    }
    widgets.sort((left, right) => left.name.localeCompare(right.name))

    return { ok: true, value: { dashboards: [...bundled, ...dashboards], widgets, unreadable } }
  }

  async read(id: string, kind: TemplateKind): Promise<TemplateResult<TemplateDocument>> {
    if (kind === 'dashboard') {
      const bundled = BUNDLED_TEMPLATE_SOURCES.find((entry) => entry.id === id)
      if (bundled) {
        try {
          return { ok: true, value: parseTemplateDocument(bundled.source) }
        } catch (error) {
          return failure(
            'invalid_template',
            messageOf(error, 'The starter template is unreadable.')
          )
        }
      }
      if (isBundledTemplateId(id)) return failure('not_found', `No starter template named "${id}".`)
    }
    try {
      return { ok: true, value: await this.readSaved(id, kind) }
    } catch (error) {
      if (isMissing(error)) return failure('not_found', `No template named "${id}".`)
      return failure('invalid_template', messageOf(error, 'The template is unreadable.'))
    }
  }

  async save(request: TemplateSaveRequest): Promise<TemplateResult<TemplateSummary>> {
    const name = request.name.trim()
    const description = request.description?.trim()
    const id = templateIdFor(name)
    if (!id) {
      return failure('invalid_template', 'A template name needs at least one letter or digit.')
    }

    let document: TemplateDocument
    try {
      const envelope = {
        format_version: TEMPLATE_FORMAT_VERSION,
        name,
        ...(description ? { description } : {})
      }
      document =
        request.kind === 'dashboard'
          ? parseTemplateDocument({
              ...envelope,
              format: TEMPLATE_FORMAT,
              configuration: JSON.parse(request.json)
            })
          : parseWidgetTemplateDocument({
              ...envelope,
              format: WIDGET_TEMPLATE_FORMAT,
              board: request.board,
              widget: JSON.parse(request.json)
            })
    } catch (error) {
      return failure(
        'invalid_template',
        messageOf(error, 'That cannot be saved as a template.')
      )
    }

    const directory = request.kind === 'dashboard' ? this.directory : this.widgetDirectory
    try {
      await mkdir(directory, { recursive: true })
      const saved = await this.savedIds(request.kind)
      if (!saved.includes(id) && saved.length >= MAXIMUM_USER_TEMPLATES) {
        return failure(
          'limit_reached',
          `The library holds at most ${MAXIMUM_USER_TEMPLATES} saved ${request.kind}s.`
        )
      }
      await writeFile(
        this.pathFor(id, request.kind),
        `${JSON.stringify(document, null, 2)}\n`,
        'utf8'
      )
    } catch (error) {
      return failure('write_failed', messageOf(error, 'Failed to write the template.'))
    }
    return {
      ok: true,
      value:
        document.format === TEMPLATE_FORMAT
          ? dashboardSummary(id, 'user', document)
          : widgetSummary(id, document)
    }
  }

  async remove(id: string, kind: TemplateKind): Promise<TemplateResult<void>> {
    if (isBundledTemplateId(id)) {
      return failure('read_only', 'A starter template cannot be deleted.')
    }
    try {
      await rm(this.pathFor(id, kind))
      return { ok: true, value: undefined }
    } catch (error) {
      if (isMissing(error)) return failure('not_found', `No template named "${id}".`)
      return failure('write_failed', messageOf(error, 'Failed to delete the template.'))
    }
  }

  private async savedIds(kind: TemplateKind): Promise<string[]> {
    try {
      const directory = kind === 'dashboard' ? this.directory : this.widgetDirectory
      return (await readdir(directory))
        .filter((fileName) => fileName.endsWith(FILE_EXTENSION))
        .map((fileName) => fileName.slice(0, -FILE_EXTENSION.length))
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
  }

  private async readSaved(id: string, kind: TemplateKind): Promise<TemplateDocument> {
    const path = this.pathFor(id, kind)
    const metadata = await stat(path)
    if (!metadata.isFile() || metadata.size > MAXIMUM_TEMPLATE_FILE_SIZE) {
      throw new Error(`A template file must not exceed ${MAXIMUM_TEMPLATE_FILE_SIZE} bytes.`)
    }
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    return kind === 'dashboard'
      ? parseTemplateDocument(value)
      : parseWidgetTemplateDocument(value)
  }

  private pathFor(id: string, kind: TemplateKind): string {
    const fileName = `${id}${FILE_EXTENSION}`
    const path = join(kind === 'dashboard' ? this.directory : this.widgetDirectory, fileName)
    if (!TEMPLATE_ID_PATTERN.test(id) || basename(path) !== fileName) {
      throw new Error(`"${id}" is not a valid template identifier.`)
    }
    return path
  }
}
