// The dashboard editor's public surface. The implementation is split by
// concern under editor/ — view state, document access, and one module per
// family of commands — and re-exported here so the panels keep one import.

export {
  MAXIMUM_ARC_WIDGETS,
  MAXIMUM_BAR_WIDGETS,
  MAXIMUM_GRAPH_WIDGETS,
  MAXIMUM_GROUPS,
  MAXIMUM_SCREENS,
  MAXIMUM_IMAGE_WIDGETS,
  MAXIMUM_INDICATOR_WIDGETS,
  MAXIMUM_SHAPE_WIDGETS,
  MAXIMUM_TEXT_WIDGETS
} from '../../../../shared/configuration-schema'

export * from './editor/store'
export * from './editor/document'
export * from './editor/screens'
export * from './editor/widgets'
export * from './editor/clipboard'
export * from './editor/arrange'
export * from './editor/naming'
export * from './editor/palette'
