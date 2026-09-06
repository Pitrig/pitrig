---
paths:
  - "configurator/src/renderer/src/features/configuration/**"
---

# Dashboard editor guidance

`features/configuration/` is split five ways, each with its own directory.

- `preview/` draws the canvas: `PreviewCanvas` and its chrome, the pure
  geometry in `canvas-geometry.ts`, one renderer per widget type, and the parts
  a gesture needs — `snapping.ts`, where a move, a resize and a drawn corner
  all resolve (a neighbour's edge first, then a gap the row already has, then
  the grid, within the level the box lives in); `ToolPalette` and
  `widget-creation.ts`, which turn a drawn box into a widget; `CanvasStatusBar`
  for the zoom and the snapping switches; and `ContextMenu` with its entries in
  `menu-entries.ts`, shared with the layer list.
- `inspector/` is the property panel: the shell dispatches by widget type into
  `widget-editors`, over shared `section-editors`, `styling-editors` and the
  form primitives in `fields.tsx`. Layout is a folding `Group` with a summary of
  what it holds and a `PropertyRow` with a dot for a value that differs from the
  device default (`authored.ts` — deliberately not "the key is present", since
  every repeated row is created carrying its defaults). Every explanation is an
  `InfoHint` beside a name; the texts are the `inspector.hints.*` keys in
  `i18n/en.json`, never prose between fields. Colours use `ColorPicker`, not
  `<input type="color">`, so the dashboard's existing colours are reachable
  inside the picker.
- `editor/` is the document layer: view state and the active tool in
  `store.ts`, panel sizes and group folds in `panel-store.ts`, snapping
  preferences in `snap-store.ts`, access and mutation in `document.ts`, and one
  module per command family (`widgets`, `screens`, `slots`, `clipboard`,
  `naming`, `palette`, and the arrange family: `alignment`,
  `geometry-commands`, `grouping`, `placement`, `reparent`).
  `dashboard-editor.ts` re-exports it as one surface, so panels keep a single
  import.
- `layers/` holds the layer list's parts under `LayersPanel.tsx`; `configs/`
  holds the Configs page's sections under `ConfigsPage.tsx` — files, the three
  documents on the board with Load/Save/Reset each, the saved-configuration
  library, the per-document diff and the raw JSON per document.

At the feature root stay `DashboardWorkspace.tsx` (the four dashboard pages and
the toolbar over them), `ConfigsPage.tsx`, `LayersPanel.tsx`,
`configuration-actions.ts` (every command that replaces the whole document,
plus per-document load and reset, as plain functions so a keystroke reaches one
without a panel mounted) and the `dashboard-editor.ts` barrel.

The editor mutates one sparse draft document: canvas drag and resize, the
inspector and the advanced JSON editor all write the same document — there is
no editor-only layout model. Editor state (selection, the opened container,
locks, hiding, grid, zoom) never reaches the document, which the device rejects
for unknown properties. Widget geometry is absolute logical pixels, relative to
the container inside one. `pendingInsert` is the placement mode for a template
fragment, and `freshWidgetIds` is the only thing that re-ids a subtree, because
two widgets claiming one id break the layer list, the selection and
`goto_screen` at once. The canvas draws live telemetry whenever the bridge on
the Protocol page is running (`createLiveValues`, ADR 0034) and each source's
placeholder or the widget's `unavailable_text` when it is not; template
thumbnails and the insert ghost keep `createPreviewValues` and stay static. The
user-facing behaviour is in `docs/device-configuration.md` under "Authoring in
the configurator".
