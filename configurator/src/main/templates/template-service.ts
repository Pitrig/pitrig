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
  isBundledTemplateId,
  templateIdFor,
  type DashboardTemplateDocument,
  type DashboardTemplateLibrary,
  type DashboardTemplateSummary,
  type TemplateError,
  type TemplateOrigin,
  type TemplateResult,
  type TemplateSaveRequest
} from '../../shared/templates'
import { parseDeviceConfigurationValue } from '../device/configuration-json'
import { BUNDLED_TEMPLATE_SOURCES } from './bundled-templates'

const FILE_EXTENSION = '.json'

/**
 * The dashboard template library: read-only starters that ship with the
 * application, and whatever the author has saved, one file per template in a
 * folder of its own under the user data directory.
 *
 * Both kinds go through the same parse, and that parse is the same one the
 * Load dialog and the device payload use — so a template can only hold a
 * document the board would accept.
 */
export class TemplateService {
  constructor(private readonly directory: string) {}

  async list(): Promise<TemplateResult<DashboardTemplateLibrary>> {
    const bundled: DashboardTemplateSummary[] = []
    let unreadable = 0
    for (const entry of BUNDLED_TEMPLATE_SOURCES) {
      try {
        bundled.push(summaryOf(entry.id, 'bundled', parseTemplateDocument(entry.source)))
      } catch {
        unreadable += 1
      }
    }

    let fileNames: string[]
    try {
      fileNames = await readdir(this.directory)
    } catch (error) {
      // Nothing saved yet is an empty library, not a failure.
      if (isMissing(error)) return { ok: true, value: { templates: bundled, unreadable } }
      return failure('read_failed', messageOf(error, 'Failed to read the template folder.'))
    }

    const saved: DashboardTemplateSummary[] = []
    for (const fileName of fileNames) {
      if (!fileName.endsWith(FILE_EXTENSION)) continue
      const id = fileName.slice(0, -FILE_EXTENSION.length)
      if (!TEMPLATE_ID_PATTERN.test(id)) {
        unreadable += 1
        continue
      }
      try {
        saved.push(summaryOf(id, 'user', await this.readSaved(id)))
      } catch {
        // One unreadable file is a gap in the list, reported as a count, rather
        // than a library that will not open at all.
        unreadable += 1
      }
    }
    saved.sort((left, right) => left.name.localeCompare(right.name))
    return { ok: true, value: { templates: [...bundled, ...saved], unreadable } }
  }

  async read(id: string): Promise<TemplateResult<DashboardTemplateDocument>> {
    const bundled = BUNDLED_TEMPLATE_SOURCES.find((entry) => entry.id === id)
    if (bundled) {
      try {
        return { ok: true, value: parseTemplateDocument(bundled.source) }
      } catch (error) {
        return failure('invalid_template', messageOf(error, 'The starter template is unreadable.'))
      }
    }
    if (isBundledTemplateId(id)) return failure('not_found', `No starter template named "${id}".`)
    try {
      return { ok: true, value: await this.readSaved(id) }
    } catch (error) {
      if (isMissing(error)) return failure('not_found', `No template named "${id}".`)
      return failure('invalid_template', messageOf(error, 'The template is unreadable.'))
    }
  }

  async save(request: TemplateSaveRequest): Promise<TemplateResult<DashboardTemplateSummary>> {
    const name = request.name.trim()
    const description = request.description?.trim()
    const id = templateIdFor(name)
    if (!id) {
      return failure('invalid_template', 'A template name needs at least one letter or digit.')
    }

    let document: DashboardTemplateDocument
    try {
      document = parseTemplateDocument({
        format: TEMPLATE_FORMAT,
        format_version: TEMPLATE_FORMAT_VERSION,
        name,
        ...(description ? { description } : {}),
        configuration: JSON.parse(request.json)
      })
    } catch (error) {
      return failure('invalid_template', messageOf(error, 'The draft cannot be saved as a template.'))
    }

    try {
      await mkdir(this.directory, { recursive: true })
      // A name that slugs to an existing identifier replaces that template; the
      // panel confirms first, which is a clearer answer than a "-2" suffix.
      const saved = await this.savedIds()
      if (!saved.includes(id) && saved.length >= MAXIMUM_USER_TEMPLATES) {
        return failure(
          'limit_reached',
          `The library holds at most ${MAXIMUM_USER_TEMPLATES} saved templates.`
        )
      }
      await writeFile(this.pathFor(id), `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    } catch (error) {
      return failure('write_failed', messageOf(error, 'Failed to write the template.'))
    }
    return { ok: true, value: summaryOf(id, 'user', document) }
  }

  async remove(id: string): Promise<TemplateResult<void>> {
    // The identifier scheme is what makes this safe: a bundled identifier can
    // never name a file, so refusing it here touches no filesystem at all.
    if (isBundledTemplateId(id)) {
      return failure('read_only', 'A starter template cannot be deleted.')
    }
    try {
      await rm(this.pathFor(id))
      return { ok: true, value: undefined }
    } catch (error) {
      if (isMissing(error)) return failure('not_found', `No template named "${id}".`)
      return failure('write_failed', messageOf(error, 'Failed to delete the template.'))
    }
  }

  private async savedIds(): Promise<string[]> {
    try {
      return (await readdir(this.directory))
        .filter((fileName) => fileName.endsWith(FILE_EXTENSION))
        .map((fileName) => fileName.slice(0, -FILE_EXTENSION.length))
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
  }

  private async readSaved(id: string): Promise<DashboardTemplateDocument> {
    const path = this.pathFor(id)
    const metadata = await stat(path)
    if (!metadata.isFile() || metadata.size > MAXIMUM_TEMPLATE_FILE_SIZE) {
      throw new Error(`A template file must not exceed ${MAXIMUM_TEMPLATE_FILE_SIZE} bytes.`)
    }
    return parseTemplateDocument(JSON.parse(await readFile(path, 'utf8')))
  }

  /**
   * The identifier pattern is the path-traversal gate; comparing the base name
   * back is the second one, so a later change to the pattern cannot quietly
   * turn an identifier into a path.
   */
  private pathFor(id: string): string {
    const fileName = `${id}${FILE_EXTENSION}`
    const path = join(this.directory, fileName)
    if (!TEMPLATE_ID_PATTERN.test(id) || basename(path) !== fileName) {
      throw new Error(`"${id}" is not a valid template identifier.`)
    }
    return path
  }
}

/**
 * An envelope, checked by identity before shape so a configuration someone
 * dropped into the folder by hand fails with a reason rather than half-parsing.
 * The document inside goes through the one parse the Load dialog and the device
 * payload share: migration, the generated validator, then the payload limit.
 */
function parseTemplateDocument(value: unknown): DashboardTemplateDocument {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('A template file holds a JSON object.')
  }
  const record = value as Record<string, unknown>
  if (record.format !== TEMPLATE_FORMAT) {
    throw new Error('This file is not a SimCore dashboard template.')
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
  if (typeof record.configuration !== 'object' || record.configuration === null) {
    throw new Error('The template carries no configuration.')
  }
  return {
    format: TEMPLATE_FORMAT,
    format_version: version,
    name: name.trim(),
    ...(description ? { description } : {}),
    configuration: parseDeviceConfigurationValue(record.configuration)
  }
}

function summaryOf(
  id: string,
  origin: TemplateOrigin,
  document: DashboardTemplateDocument
): DashboardTemplateSummary {
  return {
    id,
    name: document.name,
    ...(document.description ? { description: document.description } : {}),
    board: document.configuration.board,
    origin,
    screenCount: screensOf(document.configuration).length,
    widgetCount: allWidgetsOf(document.configuration).length
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
