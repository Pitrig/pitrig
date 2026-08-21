import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { allWidgetsOf, screensOf } from '../../shared/configuration-access'
import {
  MAXIMUM_TEMPLATE_DESCRIPTION,
  MAXIMUM_TEMPLATE_FILE_SIZE,
  MAXIMUM_TEMPLATE_NAME,
  MAXIMUM_USER_TEMPLATES,
  TEMPLATE_FORMAT,
  TEMPLATE_FORMAT_VERSION,
  TEMPLATE_ID_PATTERN,
  WIDGET_TEMPLATE_FORMAT,
  WIDGET_TEMPLATE_SUBDIRECTORY,
  isBundledTemplateId,
  templateIdFor,
  type DashboardTemplateDocument,
  type DashboardTemplateSummary,
  type TemplateDocument,
  type TemplateError,
  type TemplateKind,
  type TemplateLibrary,
  type TemplateOrigin,
  type TemplateResult,
  type TemplateSaveRequest,
  type TemplateSummary,
  type WidgetTemplateDocument,
  type WidgetTemplateSummary
} from '../../shared/templates'
import { descendantsOf } from '../../shared/configuration-access'
import { SIMCORE_BOARD_IDS, type SimCoreBoardId } from '../../shared/device'
import { parseDeviceConfigurationValue, parseWidgetFragment } from '../device/configuration-json'
import { BUNDLED_TEMPLATE_SOURCES } from './bundled-templates'

const FILE_EXTENSION = '.json'

/**
 * The template library: read-only starters that ship with the application, and
 * whatever the author has saved, one file per entry under the user data
 * directory — dashboards in the folder itself, widgets in a subfolder so the
 * two cannot collide on a name.
 *
 * Everything goes through the same parse the Load dialog and the device payload
 * use, so a template can only hold something the board would accept. A widget
 * is validated inside the smallest document that can carry it, which is the
 * same trick the editor's clipboard uses on a pasted fragment.
 */
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
        // One unreadable file is a gap in the list, reported as a count, rather
        // than a library that will not open at all.
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
      // A name that slugs to an existing identifier replaces that template; the
      // panel confirms first, which is a clearer answer than a "-2" suffix.
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
    // The identifier scheme is what makes this safe: a bundled identifier can
    // never name a file, so refusing it here touches no filesystem at all.
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

  /**
   * The identifier pattern is the path-traversal gate; comparing the base name
   * back is the second one, so a later change to the pattern cannot quietly
   * turn an identifier into a path.
   */
  private pathFor(id: string, kind: TemplateKind): string {
    const fileName = `${id}${FILE_EXTENSION}`
    const path = join(kind === 'dashboard' ? this.directory : this.widgetDirectory, fileName)
    if (!TEMPLATE_ID_PATTERN.test(id) || basename(path) !== fileName) {
      throw new Error(`"${id}" is not a valid template identifier.`)
    }
    return path
  }
}

/**
 * The document inside goes through the one parse the Load dialog and the device
 * payload share: migration, the generated validator, then the payload limit.
 */
function parseTemplateDocument(value: unknown): DashboardTemplateDocument {
  const record = envelopeOf(value, TEMPLATE_FORMAT, 'a SimCore dashboard template')
  if (typeof record.configuration !== 'object' || record.configuration === null) {
    throw new Error('The template carries no configuration.')
  }
  return {
    format: TEMPLATE_FORMAT,
    format_version: record.format_version as number,
    name: (record.name as string).trim(),
    ...(record.description ? { description: record.description as string } : {}),
    configuration: parseDeviceConfigurationValue(record.configuration)
  }
}

/**
 * The half of the envelope both kinds share: identity, version, name and
 * description. Checked before shape so a configuration someone dropped into the
 * folder by hand fails with a reason rather than half-parsing.
 */
function envelopeOf(
  value: unknown,
  format: string,
  described: string
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('A template file holds a JSON object.')
  }
  const record = value as Record<string, unknown>
  if (record.format !== format) {
    throw new Error(`This file is not ${described}.`)
  }
  const version = record.format_version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('The template declares no format version.')
  }
  if (version > TEMPLATE_FORMAT_VERSION) {
    throw new Error(`The template was written by a newer build (format ${version}).`)
  }
  const name = record.name
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > MAXIMUM_TEMPLATE_NAME) {
    throw new Error(`A template name is 1 to ${MAXIMUM_TEMPLATE_NAME} characters.`)
  }
  const description = record.description
  if (
    description !== undefined &&
    (typeof description !== 'string' || description.length > MAXIMUM_TEMPLATE_DESCRIPTION)
  ) {
    throw new Error(`A template description is at most ${MAXIMUM_TEMPLATE_DESCRIPTION} characters.`)
  }
  return record
}

function dashboardSummary(
  id: string,
  origin: TemplateOrigin,
  document: DashboardTemplateDocument
): DashboardTemplateSummary {
  return {
    kind: 'dashboard',
    id,
    name: document.name,
    ...(document.description ? { description: document.description } : {}),
    board: document.configuration.board,
    origin,
    screenCount: screensOf(document.configuration).length,
    widgetCount: allWidgetsOf(document.configuration).length
  }
}

/**
 * The widget envelope, checked the same way: identity before shape, then the
 * fragment through the validator inside the smallest document that can carry
 * it. The board it names is what the fragment's pixels were drawn in.
 */
function parseWidgetTemplateDocument(value: unknown): WidgetTemplateDocument {
  const record = envelopeOf(value, WIDGET_TEMPLATE_FORMAT, 'a SimCore widget template')
  const board = record.board
  if (typeof board !== 'string' || !SIMCORE_BOARD_IDS.includes(board as SimCoreBoardId)) {
    throw new Error('The widget template names no known board.')
  }
  if (typeof record.widget !== 'object' || record.widget === null) {
    throw new Error('The template carries no widget.')
  }
  return {
    format: WIDGET_TEMPLATE_FORMAT,
    format_version: record.format_version as number,
    name: (record.name as string).trim(),
    ...(record.description ? { description: record.description as string } : {}),
    board: board as SimCoreBoardId,
    widget: parseWidgetFragment(record.widget, board as SimCoreBoardId)
  }
}

function widgetSummary(id: string, document: TemplateDocument): WidgetTemplateSummary {
  if (document.format !== WIDGET_TEMPLATE_FORMAT) {
    throw new Error('That template is not a widget.')
  }
  const placement = document.widget.placement
  return {
    kind: 'widget',
    id,
    name: document.name,
    ...(document.description ? { description: document.description } : {}),
    board: document.board,
    origin: 'user',
    width: placement?.width ?? 0,
    height: placement?.height ?? 0,
    // descendantsOf counts the widget itself, which is what "how many widgets
    // is this entry" wants: one for a gauge, and the whole cluster for a
    // container.
    widgetCount: descendantsOf(document.widget).length,
    widget: document.widget
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function failure(code: TemplateError['code'], message: string): TemplateResult<never> {
  return { ok: false, error: { code, message } }
}
