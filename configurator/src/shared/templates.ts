import type { BoardId } from './configuration-schema'
import type { DeviceConfiguration } from './device'
import { LIBRARY_ID_PATTERN, libraryIdFor } from './library-id'

// A dashboard template is a whole configuration document plus a name to find it
// by. The name cannot live inside the document: the validator walks it against
// the generated allow-list, exactly as the firmware parser does, and rejects any
// property the contract does not declare. So the document travels as the payload
// of an envelope rather than being decorated with metadata.

export const TEMPLATE_LIST_CHANNEL = 'templates:list' as const
export const TEMPLATE_READ_CHANNEL = 'templates:read' as const
export const TEMPLATE_SAVE_CHANNEL = 'templates:save' as const
export const TEMPLATE_DELETE_CHANNEL = 'templates:delete' as const

export const TEMPLATE_FORMAT = 'simcore-dashboard-template' as const
export const TEMPLATE_FORMAT_VERSION = 1

/**
 * A stray JSON file in the templates folder is rejected by identity rather than
 * by shape, so a configuration saved there by hand fails with a clear reason
 * instead of half-parsing.
 *
 * `format_version` belongs here and not in the configuration: the configuration
 * document deliberately carries no version, and is brought forward by
 * migrateConfigurationDocument instead. The envelope is the configurator's own
 * artifact, so it can afford one.
 *
 * There is no `board` field — `configuration.board` is the single source of
 * truth, and a second copy is a copy the two can disagree about.
 */
export interface DashboardTemplateDocument {
  format: typeof TEMPLATE_FORMAT
  format_version: number
  name: string
  description?: string
  configuration: DeviceConfiguration
}

export type TemplateOrigin = 'bundled' | 'user'

/** What the library lists, without the cost of holding every document. */
export interface DashboardTemplateSummary {
  id: string
  name: string
  description?: string
  board: BoardId
  origin: TemplateOrigin
  screenCount: number
  widgetCount: number
}

export interface DashboardTemplateLibrary {
  templates: DashboardTemplateSummary[]
  /**
   * Files in the folder that could not be read or parsed. One number, so a
   * corrupt template is a visible gap rather than a silent one — and so a
   * single bad file cannot fail the whole listing.
   */
  unreadable: number
}

export interface TemplateSaveRequest {
  name: string
  description?: string
  json: string
}

export interface TemplateIdRequest {
  id: string
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

/**
 * A user template's identifier is its file's base name, under the scheme the
 * saved-configuration library shares. This is also the path-traversal gate:
 * nothing that fails it is ever allowed to name a file.
 */
export const TEMPLATE_ID_PATTERN = LIBRARY_ID_PATTERN

/**
 * Starters that ship with the application. The colon is outside the identifier
 * pattern, so a file on disk can never produce a bundled identifier and a
 * bundled one can never name a file — which is what makes "read-only" a
 * property of the scheme rather than a check someone has to remember.
 */
export const BUNDLED_TEMPLATE_PREFIX = 'bundled:'

export const MAXIMUM_TEMPLATE_NAME = 64
export const MAXIMUM_TEMPLATE_DESCRIPTION = 240
export const MAXIMUM_USER_TEMPLATES = 64
/** The envelope around a pretty-printed document that is itself capped at 64 KB. */
export const MAXIMUM_TEMPLATE_FILE_SIZE = 128 * 1024

export function isBundledTemplateId(id: string): boolean {
  return id.startsWith(BUNDLED_TEMPLATE_PREFIX)
}

/** A template name reduced to the identifier its file is named by. */
export const templateIdFor = libraryIdFor
