---
paths:
  - "configurator/**"
---

# Configurator guidance

Standard electron-vite three-way split: `main/` (Node — serial, the device
service and the protocol under `device/`, where `asset-upload.ts` and
`device-uploads.ts` are the one `SCF1` engine font, image and firmware upload
all run through; `assets/` holds the base every asset service extends, the file
chooser and the preview cache; then the `font-library/` face store and Google
Fonts catalog, the `save-to-board/` orchestrator, the `telemetry-bridge/` relay,
the `ipc/` registrations, config files, the dashboard `templates/` library, the
`configs/` folder and recent-files list, SimHub profile export),
`preload/`, `renderer/src/` (React + Zustand + Tailwind 4, organized by feature:
`configuration`, `device`, `firmware-update`, `font-library`, `image-assets`,
`modules`, `protocol`, `telemetry`, `templates`). `shared/` is everything both
processes run, not only types: the validators, the layout transfer, LED
rendering, `t()` and the generated contracts.
`src/shared/ipc.ts` declares the `PitrigApi` surface and `APP_GET_INFO_CHANNEL`
alone; **every other channel is declared in the shared module for its feature** —
`device.ts`, `templates.ts`, `config-library.ts`, `font-library.ts`,
`save-to-board.ts`, `telemetry-bridge.ts` and the rest. A new one goes there
beside its request and result types, into `PitrigApi`, into the registration
that owns the area — `main/ipc/register-ipc-handlers.ts` for the device and the
save, `register-library-handlers.ts` for files, configurations and templates,
`register-asset-handlers.ts` for fonts, images, firmware and the SimHub profile,
`main/telemetry-bridge/register-telemetry-bridge.ts` for the bridge — and the
preload bridge.

`src/debug/` is a second Electron application from the same package
(`pnpm run dev:debug`, `electron.vite.debug.config.ts` → `out-debug/`): the
serial console, the telemetry bench and the `@PR:DIAG` charts, plus its own
firmware upload and raw document editing, because one serial port admits one
process. It composes `createAppServices()` and calls `registerIpcHandlers()` plus
`registerDebugHandlers()`, and extends the bridge as `PitrigDebugApi`. The
dependency runs **one way**: `src/debug/**` may import anything; `src/main`,
`src/preload`, `src/renderer` and `src/shared` may not import `src/debug`, which
an ESLint `no-restricted-imports` rule enforces (ADR 0028). `pnpm run typecheck`
covers three projects: node, the product renderer and the debug renderer.

Both applications are branded from `src/main/branding.ts`: the icon
`resources/icon.png`, rendered from `assets/branding/` at the repository root,
and the name `applyBranding` is given — `Pitrig`, or `Pitrig Debugger` for the
second application; the header draws `renderer/src/assets/pitrig-wordmark.svg`
in `app/App.tsx`. Naming the application moves `userData`, so under the product
name the same module moves its six owned entries — `configurations`,
`templates`, `font-library`, `font-catalog-cache`, `preview-assets` and
`recent-configurations.json` — out of a `SimCore` or `@simcore/configurator`
directory left by an earlier build, one at a time and skipping any the new path
already holds.

## Documents and the draft

The draft is one aggregate `DeviceConfiguration`, sliced into the three device
documents at the edges: `shared/configuration-documents.ts` holds `documentOf` /
`mergeDocument` / `documentsDiffering`, and more than the protocol, the save
orchestrator, live apply and the Configs page see three —
`features/device/draft-state.ts`, `board-sync-store.ts`, `device-store.ts`,
`draft-text.ts`, `features/modules/use-board-preview.ts`,
`features/templates/DashboardSection.tsx` and `shared/configuration-validate.ts`
each work a document at a time, and `app/workspace/WorkspaceRail.tsx` marks the
rail from the same answer. The draft owns its board identity and works fully
disconnected; "Load config from board" is the explicit discard, and which board
is authored while nothing is plugged in is `offlineBoard` in the device store.
Modules is authored the same way — the same `createConfiguration` /
`openConfigurationFile`, the same `BoardPicker` — and on a board that publishes
no free LED pins the Add button is disabled with the reason beside it.

Board state that several pages read is a hook or a store, never one page's
local state: `features/device/draft-state.ts` (one memoized answer to whether
the draft parses, which documents differ from what the board **stores** and
**shows**, and what holds live apply back — seven components ask per frame
during a drag), `save-to-board-store.ts` (a save that outlives the button and
the remount a restart causes), `live-apply-store.ts`, `board-sync-store.ts`
(the divergence question that gates live apply) and `document-status.tsx` (the
chip the Protocol page and the Modules preview draw). The store keeps
`activeConfiguration` (stored) apart from
`runningConfiguration` (shown); a live `@PR:APPLY` moves the second and a save
moves both. The main process polls `@PR:INFO` every five seconds while the link
is idle, so a document written from elsewhere is noticed rather than
overwritten.

## Live telemetry

`main/telemetry-bridge/` puts the configurator in the middle of the link
(ADR 0034): the SimHub plugin's stream, forwarded to the board **before**
anything is parsed, and decoded in passing. `plugin-listener.ts` binds the UDP
port — `127.0.0.1` while the SimHub host resolves inside `127.*` and `0.0.0.0`
otherwise, the panel offering no network option to ask with — and validates the
seven-byte header, counting loss from the sequence and resyncing on a restarted
sender rather than reading it as reordering; a datagram carries whole lines, so
what it hands on can be written to the board as it stands. The relay yields
while `OperationRunner` holds the link and drops what arrives meanwhile, and
the plugin's once-a-second repeat is what repairs the gap. `telemetry-tap.ts`
decodes into three fixed arrays indexed by catalog slot and keeps the **source
string** for every field, not only the text ones, so the preview shows what the
board shows. The magic, the version, the
ports and the payload bound come from the generated `SIMHUB_LINK`, so the plugin
in `simhub/plugin/` and this side cannot disagree about those; the header
length, the sequence's offset inside it and the subscribe interval are written
out on both sides and stay in step by hand.

The bridge is compiled into development builds only (ADR 0034):
`TELEMETRY_BRIDGE_INCLUDED` in `shared/telemetry-bridge.ts` is
`import.meta.env.DEV` and gates `registerTelemetryBridge` in both entry points
(the service, its IPC handlers and broadcasts, kept out of `AppServices`), the
optional `telemetryBridge` preload API, and the renderer's panel, subscriptions
and catalog value column. Put the constant itself in the condition so the
bundler can drop the branch; CI fails a package whose `app.asar` still carries
`telemetry-bridge:` or `TelemetryBridgeService`.

In the renderer the table lives outside React in
`features/telemetry/live-telemetry.ts`; a snapshot bumps a revision at most once
per animation frame (and a slower one at 10 Hz for the 228-row catalog table),
so nothing re-renders while the bridge is stopped. `PreviewCanvas` reads live
values per frame and the lamp preview (`features/modules/LedPreview.tsx` over
`preview-values.ts`) with it, while the catalog table in
`features/protocol/CatalogSection.tsx` reads them on the slower revision.
`WidgetLayers` backs template thumbnails and the insert ghost and stays on
placeholders.

## Save to board

"Save to board" writes only the documents that differ from the board, protocol
first and dashboard last. When the dashboard is among them it resolves that
document's families against the font library, builds a package holding exactly
those, and skips the upload when `@PR:FONT:INFO` reports the same `crc` and
`entries`. It restarts the board only when a package was actually installed,
when the board already owed a restart, when the `protocol` document was written
(`reboot_required=1`), or when a write takes the board out of safe mode;
otherwise it closes with `@PR:APPLY` per written document. That list is stated
once, in `docs/device-configuration.md` under "Saving to the board" — change it
there too. An unresolvable family stops the save and asks for a file, and live
apply is suppressed while the board lacks a family, because firmware rejects
the document whole. `family` **is** the library id — bundled, Google or
imported — and a weight is its own entry and one of the eight slots.

## Workspaces and transfer

`app/workspace/` owns the navigation: `WorkspaceRail` over six workspaces
ordered once in `WORKSPACE_TABS`, so the rail and the `Cmd`/`Ctrl`+digit
accelerators cannot disagree; the active workspace, its page and whether the
rail is expanded are kept across restarts in `workspace-store.ts`
(`dashboardView`, `modulesView`, `railExpanded`), under one `PageShell`. What the window owns rather than a page — live apply,
`Cmd`/`Ctrl`+`S`, the unresolved-fonts dialog — is mounted in `App.tsx`. A strip
and a matrix are separate `hardware` entries on separate pins (ADR 0030), so
each Modules page lists only its own device kind, and lamp numbering is per
device from zero.

A dashboard moves to another board through `shared/layout-transfer.ts` —
`contain` or `stretch`, plus a report of what did not carry: image bitmaps, an
output whose pin the target lacks, a dashboard dropped for a target with no
display. `transferConfiguration` is the engine every entry point ends in:
`convertDraftToBoard` in `configuration-actions.ts` converts the open draft,
while a template's `Use` and `Add` call it directly from `features/templates/`.
The fit is one persisted preference in `panel-store.ts`. The template library holds dashboards and widgets in two
folders (`templates/widgets/`) on one `TemplateCard`: a dashboard's `Add`
appends screens through `insert-screen.ts` and `Use` replaces the draft; a
widget entry carries its fragment in its summary, while a dashboard's document
is read on demand and cached in `templates-store`, because a card draws it too;
placing one is `pendingInsert` in the editor store,
scaled by `insert-template.ts` only when it would not fit. Re-iding is not
special to it: every `insertWidget` runs `freshWidgetIds` over what it inserts,
as does a screen imported through `insert-screen.ts`. A template is its payload inside
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
under Electron rather than plain node. Both applications show no menu
(`src/main/app-menu.ts`): `null` on Windows and Linux; on macOS the edit, window
and quit roles stay as hidden items, because a macOS text field cuts, copies,
pastes and undoes only through menu key equivalents. Electron 44 builds a
submenu only while it holds a visible item (an all-hidden one becomes `(empty)`
without the shortcuts), so the menu is built around one item hidden right
after; AppKit's AutoFill, Dictation and Emoji items are turned off by defaults
registered before `ready`, and a menu with a submenu set before `ready` crashes
Electron 44. On Windows `serialport` reports the driver's manufacturer
(`Microsoft` for `usbser.sys`), not the board's USB string, so
`port-registry.ts` names the two identities a board shows by VID:PID — `303a:4001`,
the application link fixed in `usb_descriptors.cpp`, and `303a:1001`, the
USB-Serial/JTAG unit — as `tools/pick-serial-port.py` does.

`pnpm run build` runs typecheck then `electron-vite build`; `pnpm run package`
wraps the product in `electron-builder.yml` (`dist/`); `pnpm run build:debug`
and `pnpm run package:debug` do the same for the debugger through
`electron-builder.debug.yml` (`dist-debug/`), which points `main` at
`out-debug/` through `extraMetadata`.
