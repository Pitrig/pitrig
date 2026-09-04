---
paths:
  - "configurator/**"
---

# Configurator guidance

Standard electron-vite three-way split: `main/` (Node — serial via
`serialport`, device service, protocol, font, image and firmware upload over one
shared `assets/` engine, the `font-library/` face store and Google Fonts catalog,
the `save-to-board/` orchestrator, config files, the dashboard `templates/`
library, the `configs/` folder and recent-files list, SimHub profile export),
`preload/`, `renderer/src/` (React + Zustand + Tailwind 4, organized by feature:
`configuration`, `device`, `firmware-update`, `font-library`, `image-assets`,
`modules`, `protocol`, `templates`). `shared/` holds types crossing the boundary.
**All IPC channels and the `SimCoreApi` surface are declared in
`src/shared/ipc.ts`** — add channels there, then the main handler in
`main/ipc/register-ipc-handlers.ts` and the preload bridge.

`src/debug/` is a second Electron application from the same package
(`pnpm run dev:debug`, `electron.vite.debug.config.ts` → `out-debug/`): the
serial console, the telemetry bench and the `@SC:DIAG` charts, plus its own
firmware upload and raw document editing, because one serial port admits one
process. It composes `createAppServices()` and calls `registerIpcHandlers()` plus
`registerDebugHandlers()`, and extends the bridge as `SimCoreDebugApi`. The
dependency runs **one way**: `src/debug/**` may import anything; `src/main`,
`src/preload`, `src/renderer` and `src/shared` may not import `src/debug`, which
an ESLint `no-restricted-imports` rule enforces (ADR 0028). `pnpm run typecheck`
covers three projects: node, the product renderer and the debug renderer.

Both applications are branded from `src/main/branding.ts`: the name `SimCore`,
the icon `resources/icon.png` rendered from `assets/branding/` at the repository
root, and the header `wordmark.svg`. Naming the application moves `userData`, so
the same module moves a `@simcore/configurator` directory left by an earlier
build onto the new path and refuses when the new one already holds anything.

## Documents and the draft

The draft is one aggregate `DeviceConfiguration`, sliced into the three device
documents only at the edges: `shared/configuration-documents.ts` holds
`documentOf` / `mergeDocument` / `documentsDiffering`, and the protocol, the save
orchestrator, live apply and the Configs page are the only things that see
three. The draft owns its board identity and works fully disconnected; "Load
config from board" is the explicit discard, and which board is authored while
nothing is plugged in is `offlineBoard` in the device store. Modules is authored
the same way — the same `createConfiguration` / `openConfigurationFile`, the
same `BoardPicker` — and a board that publishes no free LED pins says so on the
page instead of hiding the button.

Board state that several pages read is a hook or a store, never one page's
local state: `features/device/draft-state.ts` (one memoized answer to whether
the draft parses, which documents differ from what the board **stores** and
**shows**, and what holds live apply back — four components ask per frame
during a drag), `save-to-board-store.ts` (a save that outlives the button and
the remount a restart causes), `live-apply-store.ts`, `board-sync-store.ts`
(the divergence question that gates live apply) and `document-status.tsx` (the
header chip). The store keeps `activeConfiguration` (stored) apart from
`runningConfiguration` (shown); a live `@SC:APPLY` moves the second and a save
moves both. The main process polls `@SC:INFO` every five seconds while the link
is idle, so a document written from elsewhere is noticed rather than
overwritten.

## Save to board

"Save to board" writes only the documents that differ from the board, protocol
first and dashboard last. When the dashboard is among them it resolves that
document's families against the font library, builds a package holding exactly
those, and skips the upload when `@SC:FONT:INFO` reports the same `crc` and
`entries`. It restarts the board only when a package was actually installed,
when the board already owed a restart, or when the `protocol` document was
written (`reboot_required=1`); otherwise it closes with `@SC:APPLY` per written
document. An unresolvable family stops the save and asks for a file, and live
apply is suppressed while the board lacks a family, because firmware rejects
the document whole. `family` **is** the library id — bundled, Google or
imported — and a weight is its own entry and one of the eight slots.

## Workspaces and transfer

`app/workspace/` owns the navigation: `WorkspaceRail` over six workspaces
ordered once in `WORKSPACE_TABS`, so the rail and the `Cmd`/`Ctrl`+digit
accelerators cannot disagree; the active workspace, page and rail width are
kept across restarts in `workspace-store.ts` (`dashboardView`, `modulesView`),
under one `PageShell`. What the window owns rather than a page — live apply,
`Cmd`/`Ctrl`+`S`, the unresolved-fonts dialog — is mounted in `App.tsx`. A strip
and a matrix are separate `hardware` entries on separate pins (ADR 0030), so
each Modules page lists only its own device kind, and lamp numbering is per
device from zero.

A dashboard moves to another board through `shared/layout-transfer.ts` —
`contain` or `stretch`, plus a report of what did not carry: image bitmaps, an
output whose pin the target lacks, a dashboard dropped for a target with no
display. Every entry point goes through `convertDraftToBoard` in
`configuration-actions.ts`, and the fit is one persisted preference in
`panel-store.ts`. The template library holds dashboards and widgets in two
folders (`templates/widgets/`) on one `TemplateCard`: a dashboard's `Add`
appends screens through `insert-screen.ts` and `Use` replaces the draft; a
widget entry carries its fragment in its summary, while a dashboard's document
is read on demand and cached in `templates-store`, because a card draws it too;
placing one is `pendingInsert` in the editor store,
scaled by `insert-template.ts` only when it would not fit, and it is the only
thing that re-ids a subtree (`freshWidgetIds`). A template is its payload inside
an envelope, and a widget fragment is validated inside the smallest document
that can carry it — the trick the clipboard uses on paste (ADR 0023). The
example configurations in `src/main/templates/bundled/` are starting points,
not inheritance profiles.

## Traps

Every dependency whose install script must run is listed in `allowBuilds` in
`pnpm-workspace.yaml`, and `electron` is one of them: its install script
downloads the binary, so without the entry `pnpm run dev` fails with
`Error: Electron uninstall` while packaging still works. An unanswered entry
(pnpm writes `set this to true or false`) makes every `pnpm run` fail until it
is decided. Nothing is code-signed (`identity: null`). Test the serial protocol
under Electron rather than plain node.

`pnpm run build` runs typecheck then `electron-vite build`; `pnpm run package`
wraps the product in `electron-builder.yml` (`dist/`); `pnpm run build:debug`
and `pnpm run package:debug` do the same for the debugger through
`electron-builder.debug.yml` (`dist-debug/`), which points `main` at
`out-debug/` through `extraMetadata`.
