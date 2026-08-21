import type { BoardId, WidgetConfiguration } from './configuration-schema'
import type { DeviceConfiguration } from './device'
import { LIBRARY_ID_PATTERN, libraryIdFor } from './library-id'

// The template library holds two kinds of thing, and they answer two different
// questions.
//
// A **dashboard** template is a whole configuration document — every screen and
// everything on them — for starting a new dashboard from. A **widget** template
// is one widget lifted out of a dashboard for reusing inside another: a gauge
// with its colour ramp already set, or a container holding a whole cluster,
// since a container carries its subtree with it.
//
// Both travel as the payload of an envelope. The name cannot live inside the
// document: the validator walks it against the generated allow-list, exactly as
// the firmware parser does, and rejects any property the contract does not
// declare.

export const TEMPLATE_LIST_CHANNEL = 'templates:list' as const
export const TEMPLATE_READ_CHANNEL = 'templates:read' as const
export const TEMPLATE_SAVE_CHANNEL = 'templates:save' as const
export const TEMPLATE_DELETE_CHANNEL = 'templates:delete' as const

export const TEMPLATE_FORMAT = 'simcore-dashboard-template' as const
export const WIDGET_TEMPLATE_FORMAT = 'simcore-widget-template' as const
export const TEMPLATE_FORMAT_VERSION = 1

/**
 * Widget entries live in a subfolder of the template directory, so the two
 * kinds cannot collide on a file name — a dashboard called "fuel" and a widget
 * called "fuel" are different things with the same natural identifier. The
 * listing of dashboards skips it for free: a directory name does not end in
 * `.json`.
 */
export const WIDGET_TEMPLATE_SUBDIRECTORY = 'widgets'

export type TemplateKind = 'dashboard' | 'widget'

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

/**
 * One widget, as it would sit on a screen: its placement is absolute, because a
 * saved fragment has no way to know which container it will be dropped into and
 * a relative box would be read against the wrong origin. `board` records what
 * those pixels meant, which is what lets an insert onto a smaller display say
 * by how much it had to shrink.
 */
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

/** What the library lists, without the cost of holding every document. */
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

/**
 * A widget entry's row shows what it is rather than what type it is: an entry
 * may be a container holding a dozen widgets, and calling that "a shape" would
 * say less than nothing. So the summary carries the box it was drawn at and how
 * many widgets it really holds, and the row draws the thing itself.
 */
export interface WidgetTemplateSummary {
  kind: 'widget'
  id: string
  name: string
  description?: string
  board: BoardId
  origin: TemplateOrigin
  width: number
  height: number
  /** The widget itself plus every descendant a container brings with it. */
  widgetCount: number
  /**
   * The fragment itself, carried in the listing rather than read per row.
   *
   * A dashboard is deliberately left out of its summary — four documents held
   * to draw four rows would be four configurations for nothing — but a widget
   * is bounded by the per-type widget caps, and both things the row does need
   * it: drawing the entry as itself, and handing it to the canvas when the
   * author presses Add. Reading it again would be a round trip for bytes that
   * were already in hand.
   */
  widget: WidgetConfiguration
}

export type TemplateSummary = DashboardTemplateSummary | WidgetTemplateSummary

export interface TemplateLibrary {
  dashboards: DashboardTemplateSummary[]
  widgets: WidgetTemplateSummary[]
  /**
   * Files in the folder that could not be read or parsed. One number, so a
   * corrupt template is a visible gap rather than a silent one — and so a
   * single bad file cannot fail the whole listing.
   */
  unreadable: number
}

/**
 * `json` is the whole configuration for a dashboard and the widget alone for a
 * widget; a widget also names the board it was drawn on, which the fragment
 * itself does not carry.
 */
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
