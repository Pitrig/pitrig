// The dashboard editor's public surface. The implementation is split by
// concern under editor/ — view state, document access, and one module per
// family of commands — and re-exported here so the panels keep one import.

export {
  MAXIMUM_ARC_WIDGETS,
  MAXIMUM_BAR_WIDGETS,
  MAXIMUM_GRAPH_WIDGETS,
  MAXIMUM_SCREENS,
  MAXIMUM_IMAGE_WIDGETS,
  MAXIMUM_INDICATOR_WIDGETS,
  MAXIMUM_SHAPE_WIDGETS,
  MAXIMUM_SLOT_PAGES,
  MAXIMUM_SLOT_WIDGETS,
  MAXIMUM_TEXT_WIDGETS
} from '@shared/configuration-schema'

// One line per module, names spelled out. `export *` hid four constants that
// no longer had a reader outside their own file; an explicit list makes the
// next one visible instead of carrying it forever.
export type { WidgetSelection } from './editor/store'
export { MAXIMUM_ZOOM, MINIMUM_ZOOM, useDashboardEditorStore } from './editor/store'
export type { WidgetLocation } from './editor/document'
export { absolutePlacement, absolutePlacements, activeScreen, ancestorsOf, completePlacement, findWidget, mutateDraftConfiguration, mutateSelectedWidget, parentContainerId, parentOf, parentOffset, selectedWidget, selectionTarget, widgetArrayOf, writePlacement } from './editor/document'
export { addScreen, deleteScreen, ensureScreen, moveScreen, mutateActiveScreen } from './editor/screens'
export { DEFAULT_CAPTION_FONT_SIZE_PX, DEFAULT_WIDGET_FONT_SIZE_PX, NEW_WIDGET_SIZE, actionCount, addTapZone, addWidget, applyFontFamilyToDashboard, deleteWidget, draftFontFamily, draftValueFont, duplicateWidget, insertWidget, offsetWidget } from './editor/widgets'
export { addSlotPage, deleteSlotPage, mutateSlotPage } from './editor/slots'
export { copyWidget, pasteWidget } from './editor/clipboard'
export type { AlignmentEdge } from './editor/alignment'
export { alignWidgets, distributeWidgets } from './editor/alignment'
export { unwrapShape, wrapInShape } from './editor/grouping'
export type { DropRelation } from './editor/reparent'
export { canMoveWidget, canMoveWidgetInto, moveWidget, moveWidgetInto } from './editor/reparent'
export type { StackMove } from './editor/stacking'
export { restackOrder, restackWidget, stackRankOf } from './editor/stacking'
export { renameScreen, renameWidget } from './editor/naming'
export { dashboardPalette } from './editor/palette'
