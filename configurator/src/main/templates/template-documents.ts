import { allWidgetsOf, descendantsOf, screensOf } from '../../shared/configuration-access'
import { SIMCORE_BOARD_IDS, type SimCoreBoardId } from '../../shared/device'
import {
  parseDeviceConfigurationValue,
  parseWidgetFragment
} from '../device/configuration-json'
import {
  MAXIMUM_TEMPLATE_DESCRIPTION,
  MAXIMUM_TEMPLATE_NAME,
  TEMPLATE_FORMAT,
  TEMPLATE_FORMAT_VERSION,
  WIDGET_TEMPLATE_FORMAT,
  type DashboardTemplateDocument,
  type DashboardTemplateSummary,
  type TemplateDocument,
  type TemplateError,
  type TemplateOrigin,
  type TemplateResult,
  type WidgetTemplateDocument,
  type WidgetTemplateSummary
} from '../../shared/templates'

/**
 * The document inside goes through the one parse the Load dialog and the device
 * payload share: migration, the generated validator, then the payload limit.
 */
export function parseTemplateDocument(value: unknown): DashboardTemplateDocument {
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
export function envelopeOf(
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

export function dashboardSummary(
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
export function parseWidgetTemplateDocument(value: unknown): WidgetTemplateDocument {
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

export function widgetSummary(id: string, document: TemplateDocument): WidgetTemplateSummary {
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

export function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

export function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function failure(code: TemplateError['code'], message: string): TemplateResult<never> {
  return { ok: false, error: { code, message } }
}
