import type { BoardId, WidgetConfiguration } from './configuration-schema'
import type { DeviceConfiguration } from './device'
import { LIBRARY_ID_PATTERN, libraryIdFor } from './library-id'

export const TEMPLATE_LIST_CHANNEL = 'templates:list' as const
export const TEMPLATE_READ_CHANNEL = 'templates:read' as const
export const TEMPLATE_SAVE_CHANNEL = 'templates:save' as const
export const TEMPLATE_DELETE_CHANNEL = 'templates:delete' as const

export const TEMPLATE_FORMAT = 'simcore-dashboard-template' as const
export const WIDGET_TEMPLATE_FORMAT = 'simcore-widget-template' as const
export const TEMPLATE_FORMAT_VERSION = 1

export const WIDGET_TEMPLATE_SUBDIRECTORY = 'widgets'

export type TemplateKind = 'dashboard' | 'widget'

export interface DashboardTemplateDocument {
  format: typeof TEMPLATE_FORMAT
  format_version: number
  name: string
  description?: string
  configuration: DeviceConfiguration
}

export interface WidgetTemplateDocument {
  format: typeof WIDGET_TEMPLATE_FORMAT
  format_version: number
  name: string
  description?: string
  board: BoardId
  widget: WidgetConfiguration
}

export type TemplateDocument = DashboardTemplateDocument | WidgetTemplateDocument

export type TemplateOrigin = 'bundled' | 'user'

export interface DashboardTemplateSummary {
  kind: 'dashboard'
  id: string
  name: string
  description?: string
  board: BoardId
  origin: TemplateOrigin
  screenCount: number
  widgetCount: number
}

export interface WidgetTemplateSummary {
  kind: 'widget'
  id: string
  name: string
  description?: string
  board: BoardId
  origin: TemplateOrigin
  width: number
  height: number
  widgetCount: number
  widget: WidgetConfiguration
}

export type TemplateSummary = DashboardTemplateSummary | WidgetTemplateSummary

export interface TemplateLibrary {
  dashboards: DashboardTemplateSummary[]
  widgets: WidgetTemplateSummary[]
  unreadable: number
}

export type TemplateSaveRequest =
  | { kind: 'dashboard'; name: string; description?: string; json: string }
  | { kind: 'widget'; name: string; description?: string; json: string; board: BoardId }

export interface TemplateIdRequest {
  id: string
  kind: TemplateKind
}

export interface TemplateError {
  code:
    | 'invalid_template'
    | 'not_found'
    | 'read_only'
    | 'read_failed'
    | 'write_failed'
    | 'limit_reached'
  message: string
}

export type TemplateResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: TemplateError }

export const TEMPLATE_ID_PATTERN = LIBRARY_ID_PATTERN

export const BUNDLED_TEMPLATE_PREFIX = 'bundled:'

export const MAXIMUM_TEMPLATE_NAME = 64
export const MAXIMUM_TEMPLATE_DESCRIPTION = 240
export const MAXIMUM_USER_TEMPLATES = 64
export const MAXIMUM_TEMPLATE_FILE_SIZE = 128 * 1024

export function isBundledTemplateId(id: string): boolean {
  return id.startsWith(BUNDLED_TEMPLATE_PREFIX)
}

export const templateIdFor = libraryIdFor
