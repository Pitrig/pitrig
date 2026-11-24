---
paths:
  - "configurator/**"
---

# Configurator guidance

Standard electron-vite three-way split: `main/` (Node — serial, the device
service and the protocol under `device/`, where `asset-upload.ts` and
`device-uploads.ts` are the one `SCF1` engine font, image and firmware upload
all run through; `assets/` holds the base every asset service extends and the
file chooser; then the `font-library/` face store and Google Fonts catalog, the
`image-library/` store of converted images (ADR 0018) with the one-time move of
the old preview cache, `dashboard-files/` for `.pitrigdash` share and open
(ADR 0041), the `save-to-board/` orchestrator with its font and image delivery,
`firmware-update/` with the
`Update board` sequence, `first-install/` (the cable install of a release
through the chip's ROM loader, its client under `rom/`, ADR 0045), the
`telemetry-bridge/` relay, the `updates/` channel
(ADR 0037, registered by the product entry point only, like the bridge), the
`usage/` reporter (ADR 0040, product entry point only, off in development), the
`ipc/` registrations, config files, the dashboard `templates/` library, the
`configs/` folder and recent-files list),
`preload/`, `renderer/src/` (React + Zustand + Tailwind 4, organized by feature:
`configuration`, `controls`, `dashboard-files`, `device`, `firmware-update`, `font-library`,
`image-assets`, `modules`, `protocol`, `telemetry`, `templates`, `updates`). `shared/` is everything both
processes run, not only types: the validators, the layout transfer, LED
rendering, `t()` and the generated contracts.
`src/shared/ipc.ts` declares the `PitrigApi` surface and `APP_GET_INFO_CHANNEL`
alone; **every other channel is declared in the shared module for its feature** —
`device.ts`, `templates.ts`, `config-library.ts`, `font-library.ts`,
`save-to-board.ts`, `telemetry-bridge.ts` and the rest. A new one goes there
beside its request and result types, into `PitrigApi`, into the registration
that owns the area — `main/ipc/register-ipc-handlers.ts` for the device and the
save, `register-library-handlers.ts` for files, configurations, templates and
dashboard files, `register-asset-handlers.ts` for fonts, images, the image
library, firmware and the first install,
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
`features/modules/use-board-preview.ts`,
`features/templates/DashboardSection.tsx` and `shared/configuration-validate.ts`
each work a document at a time, and `app/workspace/WorkspaceRail.tsx` marks the
rail from the same answer. The draft owns its board identity and works fully
disconnected; "Load from board" is the explicit discard, and which board
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
the plugin's once-a-second repeat is what repairs the gap; it drops the plugin's
datagrams too while the Modules simulator drives the board through
`telemetry-bridge:simulate` (`features/modules/board-simulation.ts`). `telemetry-tap.ts`
decodes into three fixed arrays indexed by catalog slot and keeps the **source
string** for every field, not only the text ones, so the preview shows what the
board shows. The magic, the version, the
ports and the payload bound come from the generated `SIMHUB_LINK`, so the plugin
in `simhub/plugin/` and this side cannot disagree about those; the header
length, the sequence's offset inside it and the subscribe interval are written
out on both sides and stay in step by hand.

Every build carries the bridge (ADR 0035): `registerTelemetryBridge` starts it
with the application, dialing the plugin on loopback, and the product entry
point is the only one that registers it — the debugger has none. Its request
carries the desired state, `PluginHandover` (`plugin-handover.ts`) keeps the
ports held and the boards handed back, and every port open goes through
`PortLeases` in `device/port-leases.ts`: a lease asks the plugin to let go
before the open, survives a reboot and the scan's second open, and ends with a
handback on disconnect. A board the plugin feeds counts as found in the scan
without being opened. The renderer sends what to stream through
`features/telemetry/telemetry-interest.ts` — the running documents' and the
draft's bindings, or every field while the catalog table is mounted — and with
it whether the Controls page (`features/controls/`) wants the plugin's
`@PT:INPUT` reports and the draft's `inputs`, which `PluginHandover` sends as
`button`/`position` lines while it holds a board.

In the renderer the table lives outside React in
`features/telemetry/live-telemetry.ts`; a snapshot bumps a revision at most once
per animation frame (and a slower one at 10 Hz for the 330-row catalog table),
so nothing re-renders while the bridge is stopped. `PreviewCanvas` reads live
values per frame and the lamp preview (`features/modules/LedPreview.tsx` over
`preview-values.ts`) with it, while the catalog table in
`features/protocol/CatalogSection.tsx` reads them on the slower revision.
`WidgetLayers` backs template thumbnails and the insert ghost and stays on
placeholders.

## Save to board

"Save to board" writes only the documents that differ from the board, protocol
first and dashboard last, after the assets: `save-to-board/font-delivery.ts`
resolves the dashboard's families against the font library (downloading a
Google face the catalog knows) and skips the upload when `@PR:FONT:INFO` reports
the same `crc` and `entries`, and `image-delivery.ts` builds the package of
exactly the images the dashboard draws from the image library and skips it when
`planImageDelivery` in `shared/image-library.ts` finds the board holding them —
the same function draft-state uses to enable the button and hold live apply
back. Assets are checked whenever the dashboard is in scope, not only when its
document changed, so a board that lost a face or an image gets it back. It
restarts the board only when a package was actually installed, when the board
already owed a restart, when the `protocol` document was written
(`reboot_required=1`), or when a write takes the board out of safe mode;
otherwise it closes with `@PR:APPLY` per written document. That list is stated
once, in `docs/device-configuration.md` under "Saving to the board" — change it
there too. An unresolvable family stops the save and asks for a file, an image
on neither this PC nor the board stops it with the names, as does one the save
could install only by dropping a picture just the board holds, and live apply is
suppressed while the board lacks a family or an image, because firmware rejects
the document whole. A save also stops in `memory-check.ts` when the faces and
decoded images the board would hold pass the board profile's `assetMemoryBytes`
and more than it holds now. `family` **is** the library id — bundled, Google or
imported — and a weight is its own entry and one of the eight slots; an image id
is an image-library id the same way.

A `.pitrigdash` file opens through the same `Open…` as a configuration file:
`ConfigurationFileService` hands it to `DashboardFileService`, which validates
the whole container before it adds anything, then the renderer adopts the
dashboard through `features/templates/adopt-dashboard.ts`, the function a
template's `Use` calls, and `OpenReportNotice` keeps the report above the
dashboard pages until it is dismissed.

## Workspaces and transfer

`app/workspace/` owns the navigation: `WorkspaceRail` over seven workspaces
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
folders (`templates/widgets/`) on one `TemplateCard`, each saved one a
`.pitrigdash` file with its images and fonts (`template-files.ts`; a `.json`
from an earlier version is converted once by `template-migration.ts`): a
dashboard's `Add` appends screens through `insert-screen.ts` and `Use` replaces
the draft; a widget entry carries its fragment in its summary, while a
dashboard's document is read on demand and cached in `templates-store`, because
a card draws it too; a widget's `Add` goes through `templates:adopt` first, so
its images reach the library, and placing it is `pendingInsert` in the editor store,
scaled by `insert-template.ts` only when it would not fit. Re-iding is not
special to it: every `insertWidget` runs `freshWidgetIds` over what it inserts,
as does a screen imported through `insert-screen.ts`. A template is its payload inside
an envelope, and a widget fragment is validated inside the smallest document
that can carry it — the trick the clipboard uses on paste (ADR 0023). The
example configurations in `src/main/templates/bundled/` are starting points,
not inheritance profiles. A starter that draws images is a `.pitrigdash` file
there, listed with its author's credit in `bundled-templates.ts` and opened by
`bundled-template-library.ts` through the dashboard file service, so `Use` and
`Add` (`templates:adopt`) bring its images into the library. Entries there that
share a `variant.family` are listed as one summary carrying `variants`, and the
card's `Use` and `Add` ask which version through `VariantDialog`. A saved
template's card writes its file out through `templates:share`, and each
section's Open adds a received one through `templates:import`.

## Interface text

Text lives in `i18n/en.json` with `uk.json`, `ko.json`, `pl.json`, `de.json` and
`es.json` beside it (ADR 0031); the keys under `simhub.` are the SimHub plugin's. The generator fails while a locale lacks a key, so a new English
message carries its five translations in the same change, in the terms and
style of `i18n/glossary.md`; a reworded one needs them updated by hand, since
nothing detects it. The language is fixed for a run:
`main/ui-language/startup-language.ts` is the first import of `main/index.ts`
and must stay ahead of every module that calls `t()`. The Info page's Language
section writes `language.json` in userData and relaunches the packaged
application; in development it only saves, so restart `pnpm run dev` to see it.

## Traps

Every dependency whose install script must run is listed in `allowBuilds` in
`pnpm-workspace.yaml`. Electron's package has had no install script since 44.9,
so the configurator's own `postinstall` runs `install-electron`: electron-vite
reads `node_modules/electron/path.txt` instead of downloading, and without the
binary `pnpm run dev` fails with `Error: Electron uninstall` while packaging
still works. An unanswered entry
(pnpm writes `set this to true or false`) makes every `pnpm run` fail until it
is decided. The same file's `minimumReleaseAge` (seven days) and
`trustPolicy: no-downgrade` stop `pnpm add`, `pnpm update` and even a frozen
install on a version that is too new or published with less trust: answer with
a reviewed exact-version entry in `minimumReleaseAgeExclude` or
`trustPolicyExclude` (ADR 0042), never by lowering the setting. Nothing is
code-signed (`identity: null`). Test the serial protocol
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
`shared/usb-ports.ts` names the two identities a board shows by VID:PID — `303a:4001`,
the application link fixed in `usb_descriptors.cpp`, and `303a:1001`, the
USB-Serial/JTAG unit — as `tools/pick-serial-port.py` does. `port.set` asserts
any line it is not given, so the ROM-loader resets pass both `dtr` and `rts`.

`pnpm run build` runs typecheck then `electron-vite build`; `pnpm run package`
wraps the product in `electron-builder.yml` (`dist/`); `pnpm run build:debug`
and `pnpm run package:debug` do the same for the debugger through
`electron-builder.debug.yml` (`dist-debug/`), which points `main` at
`out-debug/` through `extraMetadata`.
