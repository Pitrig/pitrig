import { allWidgetsOf, descendantsOf, screensOf } from '../../shared/configuration-access'
import { PITRIG_BOARD_IDS, type PitrigBoardId } from '../../shared/device'
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
import { t } from '@shared/ui-text'

export function parseTemplateDocument(value: unknown): DashboardTemplateDocument {
  const record = envelopeOf(value, TEMPLATE_FORMAT, 'a Pitrig dashboard template')
  if (typeof record.configuration !== 'object' || record.configuration === null) {
    throw new Error(t('templates.templateDocuments.theTemplateCarriesNoConfiguration'))
  }
  return {
    format: TEMPLATE_FORMAT,
    format_version: record.format_version as number,
    name: (record.name as string).trim(),
    ...(record.description ? { description: record.description as string } : {}),
    configuration: parseDeviceConfigurationValue(record.configuration)
  }
}

function envelopeOf(
  value: unknown,
  format: string,
  described: string
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(t('templates.templateDocuments.aTemplateFileHoldsA'))
  }
  const record = value as Record<string, unknown>
  if (record.format !== format) {
    throw new Error(t('templates.templateDocuments.thisFileIsNotDescribed', { described: described }))
  }
  const version = record.format_version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(t('templates.templateDocuments.theTemplateDeclaresNoFormat'))
  }
  if (version > TEMPLATE_FORMAT_VERSION) {
    throw new Error(t('templates.templateDocuments.theTemplateWasWrittenBy', { version: version }))
  }
  const name = record.name
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > MAXIMUM_TEMPLATE_NAME) {
    throw new Error(t('templates.templateDocuments.aTemplateNameIs1', { mAXIMUM_TEMPLATE_NAME: MAXIMUM_TEMPLATE_NAME }))
  }
  const description = record.description
  if (
    description !== undefined &&
    (typeof description !== 'string' || description.length > MAXIMUM_TEMPLATE_DESCRIPTION)
  ) {
    throw new Error(t('templates.templateDocuments.aTemplateDescriptionIsAt', { mAXIMUM_TEMPLATE_DESCRIPTION: MAXIMUM_TEMPLATE_DESCRIPTION }))
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

export function parseWidgetTemplateDocument(value: unknown): WidgetTemplateDocument {
  const record = envelopeOf(value, WIDGET_TEMPLATE_FORMAT, 'a Pitrig widget template')
  const board = record.board
  if (typeof board !== 'string' || !PITRIG_BOARD_IDS.includes(board as PitrigBoardId)) {
    throw new Error(t('templates.templateDocuments.theWidgetTemplateNamesNo'))
  }
  if (typeof record.widget !== 'object' || record.widget === null) {
    throw new Error(t('templates.templateDocuments.theTemplateCarriesNoWidget'))
  }
  return {
    format: WIDGET_TEMPLATE_FORMAT,
    format_version: record.format_version as number,
    name: (record.name as string).trim(),
    ...(record.description ? { description: record.description as string } : {}),
    board: board as PitrigBoardId,
    widget: parseWidgetFragment(record.widget, board as PitrigBoardId)
  }
}

export function widgetSummary(id: string, document: TemplateDocument): WidgetTemplateSummary {
  if (document.format !== WIDGET_TEMPLATE_FORMAT) {
    throw new Error(t('templates.templateDocuments.thatTemplateIsNotA'))
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
