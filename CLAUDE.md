# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working agreement

[AGENTS.md](AGENTS.md) is the development guide for this repository — read it before implementing.
Key points that change how you should work here:

- **Documentation is the source of truth.** Consult [docs/vision.md](docs/vision.md),
  [docs/architecture.md](docs/architecture.md), and [docs/adr/](docs/adr) before implementing. If docs
  and code disagree, docs win. Never invent architecture.
- **No test suites.** Do not add automated test files. Validate through firmware builds, static
  checks, and manual/hardware verification.
- **ADRs** are required for significant architectural decisions; prefer updating an existing ADR over
  adding a new one. Do not write ADRs for refactors, naming, or formatting.
- For larger tasks: analyze → plan → wait for approval → implement → review. If a change requires
  architectural changes, stop and ask first.

## Commands

### Firmware (ESP-IDF, C++20)

Requires a sourced ESP-IDF environment: `source tools/idf-env.sh <build-directory>`. It finds the
installation and takes the Python virtualenv that build directory was configured with — an install
can carry more than one, and when the running interpreter differs from the recorded one `idf.py`
refuses to build and suggests `fullclean`, which throws the build away instead of fixing it. Plain
`source <idf-path>/export.sh` is enough for a build directory that does not exist yet.

Run from `firmware/`. Each board is a separate build directory + generated sdkconfig; always pass
both `-DSDKCONFIG` and `-DSDKCONFIG_DEFAULTS` so board defaults are not lost. ESP-IDF also applies
`sdkconfig.defaults.<IDF_TARGET>` (`.esp32s3` / `.esp32p4`) on its own, which is where the
target-wide settings such as PSRAM mode and the P4 DSI/PPA options live.

```bash
cd firmware && idf.py -B build-t-display -DIDF_TARGET=esp32s3 -DSDKCONFIG=sdkconfig.generated.t-display -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.t-display-s3" build
```

```bash
cd firmware && idf.py -B build-guition -DIDF_TARGET=esp32s3 -DSDKCONFIG=sdkconfig.generated.guition -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.guition-esp32-4848s040" build
```

```bash
cd firmware && idf.py -B build-jc1060p470c -DIDF_TARGET=esp32p4 -DSDKCONFIG=sdkconfig.generated.jc1060p470c -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.guition-jc1060p470c" build
```

Debug builds append `;sdkconfig.defaults.debug` to `SDKCONFIG_DEFAULTS`, which selects
`CONFIG_SIMCORE_DEBUG`. Feature selection is Kconfig-driven; no source header is edited (see
[docs/runtime-performance.md](docs/runtime-performance.md)). The same VS Code tasks exist in
[.vscode/tasks.json](.vscode/tasks.json) ("SimCore: Build …").

A P4 build may append `;sdkconfig.defaults.second-link` as well, which selects
`CONFIG_SIMCORE_SECOND_TELEMETRY_LINK` and runs telemetry, `@SC:` control, and asset upload on the
USB-Serial-JTAG port too. It is a development aid: the configuration contract has no property for
it, and with the option off the flashed sections are byte-identical to a build without it. See
[docs/simhub-custom-serial.md](docs/simhub-custom-serial.md).

Flash and monitor use the same `-B` build directory, e.g.
`idf.py -B build-t-display -p <port> flash monitor`.

Switching boards means switching `IDF_TARGET`; `esp32p4` uses `dependencies.lock.esp32p4` and applies
LVGL PPA / DSI patches from `firmware/cmake/`.

### Configurator (Electron + React 19 + TypeScript, pnpm)

```bash
cd configurator && pnpm install && pnpm run dev
```

```bash
cd configurator && pnpm run typecheck
```

```bash
cd configurator && pnpm run lint
```

`pnpm run build` runs typecheck then `electron-vite build`. There is no test runner.

### Generated contracts (never hand-edit outputs)

Three generators own checked-in code. All accept `--check`, which reports staleness without
writing.

`configuration/configuration_schema.json` is the configuration contract:

```bash
python3 tools/generate_configuration_schema.py
```

Outputs: `firmware/services/configuration_contract/include/application_configuration_generated.hpp`,
`firmware/services/configuration/include/configuration_schema_generated.hpp`,
`configurator/src/shared/configuration-schema.ts`, `docs/configuration-schema.md`.

### Telemetry catalog

`telemetry/telemetry_catalog.json` and `telemetry/simhub_generic_mappings.json` are the sources.
Regenerate all consumers together:

```bash
python3 tools/generate_telemetry_catalog.py
```

Outputs: `firmware/services/telemetry/include/telemetry_catalog_generated.hpp`,
`firmware/services/telemetry/protocols/simhub/include/simhub_catalog_generated.hpp`,
`configurator/src/shared/telemetry-catalog.ts`, `configurator/src/shared/simhub-profile-data.ts`,
`docs/telemetry-catalog.md`, `simhub/SimCore-telemetry.shsds`.

### Google Fonts catalog

`fonts/google_fonts_snapshot.json` (fetched from Google, no API key) and
`fonts/google_fonts_selection.json` (the curation rules) are the sources:

```bash
python3 tools/generate_font_catalog.py
```

Output: `configurator/src/main/font-library/google-fonts-catalog.json`, read lazily in the main
process and never bundled into JS. `--refresh` re-fetches the snapshot; without it the generator is
offline and deterministic. The generator derives no family ids — `fontFamilyId()` in
`configurator/src/shared/font-library.ts` is the single implementation and the generator only checks
that every derivable id is valid and unique.

## Architecture

Three cooperating pieces: **firmware** on the ESP32 device, a desktop **configurator** that authors
and uploads configuration over serial, and **SimHub** on the PC feeding telemetry over the same
serial link.

### Firmware layering (`firmware/`)

Strict, one-directional dependency layers — this is the constraint most changes must respect:

```
main → core → { components, services, platform composition }
platform composition → modules / components / services
components → interfaces ← drivers
```

- `core/` — static composition root: startup, config load, bounded module lifecycle, event dispatch.
  Contains no hardware-specific and no feature-specific code, and reaches no LVGL header: the
  dashboard is opaque to it (`dashboard_composition::instance()`), so a widget type change does not
  recompile it. `application.hpp` holds what it owns, `apply_configuration.cpp` the ADR 0016
  replacement transaction, `simcore.cpp` the startup phases. `core/module_manager` holds
  compile-time descriptors (function pointers + explicit contexts); no allocation, no name lookup.
- `interfaces/` — small contracts (`display`, `input`, `transport`) implemented by drivers. The
  `display` and `input` contracts live in one `interfaces` component; `transport` is its own.
- `components/` — reusable hardware capabilities (`display`, `input`); depend on interfaces, never
  on concrete drivers.
- `drivers/` — board/hardware implementations (`t_display_s3`, `guition_esp32_4848s040`,
  `guition_jc1060p470c`, `touch/gt911`, `transport/uart`, `transport/usb_cdc`,
  `transport/usb_serial_jtag`, plus `transport/transport_common` for the read counters every link
  shares and the log silencing the two console-port links use). No application logic. A board with
  no digitizer leaves `BoardDefinition::input` null.
- `modules/` — user-visible functionality (`lap_timer`). Must not depend on platform
  code or LVGL, and must not touch hardware directly.
- `services/` — shared infrastructure (`asset_control`, `asset_package`, `asset_storage`,
  `binary_session`, `configuration`, `configuration_contract`, `configuration_control`,
  `event_bus`, `firmware_update`, `font_assets`, `font_asset_control`, `font_contract`,
  `image_assets`, `image_asset_control`, `image_contract`, `logger`, `performance`, `telemetry` +
  `telemetry/protocols/simhub`). `asset_control` is the `SCF1` upload engine;
  `font_asset_control`, `image_asset_control` and `firmware_update` are thin per-kind wrappers
  over it that supply the protocol tag and the body of the `INFO` reply. `firmware_update` is one
  component rather than a service plus a wrapper, because nothing reads a firmware image at
  runtime the way the dashboard reads faces and bitmaps. `asset_package` holds what the package
  formats share — the 32-byte header, its validation, and the update status and error types —
  while each kind keeps its own magic, manifest entry decoder and catalog.
- `platform/` — framework/board-specific wiring: `board_registry`, `communication`,
  `dashboard` (LVGL `widgets` over a shared `frame`, plus `conditions`, `fonts`, `images`,
  `layout`, `navigation` for screen swiping, `slots` for container switching, `value_text` for
  turning one value into the text a widget draws, `utilities`, and the embedded boot-splash
  `assets`),
  `dashboard_composition`, `module_composition`, `nvs_config_storage`,
  `partition_asset_storage`, `telemetry_transport`, `external_memory`.
- `utils/` — helpers with no dependency on any other layer (`binary`, `simcore_config`,
  `transformers/number_transform`, `transformers/text_writer`, `transformers/time_transform`).
  `simcore_config` is the Kconfig surface and the `SIMCORE_*` feature aliases; it lives here
  because every layer reads it, and it sat under `components/` long enough to give drivers and
  services a dependency on a component, which the layering forbids.

Every layer directory listed above is a separate ESP-IDF component. All of them except
`components/` are registered in `EXTRA_COMPONENT_DIRS` in
[firmware/CMakeLists.txt](firmware/CMakeLists.txt) — **adding a new service/module/driver requires
adding its path there** (and the P4-vs-S3 branch for board drivers). `components/` is ESP-IDF's own
default search path and needs no entry. Public headers live in `include/`, sources in `src/`.

Extension order: add a module first, reuse existing components/services, add a component only for a
new hardware capability, add a driver only for new hardware. The core should rarely change.

### Board identity vs. user configuration

A firmware build owns exactly one immutable `BoardDefinition` selected by
`CONFIG_SIMCORE_FACTORY_BOARD_*` (set by the `sdkconfig.defaults.<board>` file). It binds board id,
display driver, default telemetry transport, factory payload, and private validation metadata
(display bounds, the board's UART pin pair). Firmware reports only the stable board identifier; the
configurator maps it to a local board profile for logical display dimensions. User configuration must
carry a matching `board` or it is rejected. `SET` writes NVS and answers `reboot_required=1`;
`APPLY` rebuilds the running dashboard from a document without writing storage, which is what the
configurator's live preview uses — and what a save pairs with `SET` so an ordinary save costs no
restart.

Config load order: valid NVS slot A → valid NVS slot B → compiled factory config (board id only,
which yields an enabled display with an empty dashboard). NVS record format (magic, generation,
CRC32, dual slot in the `simcore_cfg` partition) is private to the configuration service; the
configurator must not depend on it.

### Configuration schema

Sparse JSON, used unchanged for both configurator projects and the device wire payload — omitted
properties are *not* expanded through board profiles. Widget geometry is absolute logical display
pixels, except inside a **container**, where it is relative to the container's box (ADR 0021). A
**shape** widget is the drawing container: it may hold widgets, including other shapes, nested up to
`kMaximumNestingDepth`. A container does **not** clip its children — a caption or a widget that
overhangs it is drawn, and only the display still bounds a box. A dashboard holds up to four
screens, swiped between on a board with touch (ADR 0020). A **slot** widget is an area that switches
what it shows: it draws nothing, is authored only on a screen, and holds up to `kMaximumSlotPages`
pages of which one is visible — a tap cycles the pages that are `in_loop`, and a page whose
`trigger` fires (`conditions` over `source`, or `value_changed`) is raised over the loop for its
`duration_ms`, first page in the array winning. Any widget may
carry an `action`, so a tap navigates to the next, previous, or a named screen; an empty
transparent shape with an action is an invisible touch zone. Bounded limits (64 KB payload, per-type widget caps, 4 modifiers per
source, byte limits on strings) and the full property table are in
[docs/device-configuration.md](docs/device-configuration.md) — read it before touching config code on
either side. The contract itself lives in the `configuration_contract` service component (no storage,
no protocol, no LVGL) and mirrors into `configurator/src/shared/`.

### Value pipeline (bindings → modifiers → transform)

Widgets never know telemetry field names or protocol IDs. Telemetry ingestion splits into an
immutable registry (protocol-neutral names/types), one-time startup binding of protocol source IDs to
handles, and mutable state in fixed slots. A startup-only widget binder hands each text widget one
pre-bound typed callback per `sources` entry (up to `kMaximumTextSources`), and the widget renders
them in order into one string; stateful modifiers (e.g. `lap_timer`) are module code behind that
callback, and pure transforms live in `utils/transformers`. Transform `prefix`/`suffix` supply the
literal text between sources, so composition needs no format string. A widget may also bind one
`condition_source` it does not display and carry bounded styling rules over it; the first match wins
and the LVGL-free resolver in `platform/dashboard/conditions` returns the appearance, with the
authored style as the fallback. Periodic paths perform no name lookup and no allocation. See ADRs
0003, 0005, 0012, 0017.

### Communication

One serial transport is shared by three concerns, arbitrated by the router in
`platform/communication`: line-oriented SimHub telemetry, the line-oriented `@SC:` configuration
control protocol (`INFO`, `GET`, `VALIDATE`, `APPLY`, `SET`, `RESET`, `REBOOT`), and a temporary binary
stop-and-wait mode for font package upload. `core` receives only `ITransport` and knows nothing about
UART, USB CDC, or SimHub. See [docs/simhub-custom-serial.md](docs/simhub-custom-serial.md) and
[docs/font-assets.md](docs/font-assets.md).

### Uploaded assets and firmware

Fonts and images are both uploaded, never compiled in, and they share everything
except their package format: one 4 MiB `image_assets` partition beside the 2 MiB
`font_assets` one, the `asset_storage` contract under both, the `SCF1` frames
over `@SC:FONT:` / `@SC:IMAGE:`, and a single `binary_session::Claim` that
decides which one owns the serial link — a second upload is answered `busy`
rather than raced. Images are converted **in the configurator** to the LVGL
layout and the size they are drawn at; the device holds no decoder and neither
scales nor rotates. See [docs/image-assets.md](docs/image-assets.md) and
[docs/adr/0018-uploaded-image-assets.md](docs/adr/0018-uploaded-image-assets.md).

Firmware travels the same way under `@SC:FW:` and takes the same claim. The
partition table carries two 2 MiB application slots and no `factory`: an upload
fills the one that is not running, `@SC:REBOOT` starts it, and rollback returns
to the previous slot if startup does not finish. The image is wrapped in the
same 32-byte header with a manifest naming the `BoardId`, because ESP-IDF checks
the chip and both S3 boards are the same chip. Changing the partition table is a
full `erase-flash`. See [docs/ota.md](docs/ota.md) and
[docs/adr/0022-over-the-air-firmware-updates.md](docs/adr/0022-over-the-air-firmware-updates.md).

### Fonts

Production firmware compiles **no** dashboard fonts. The `font_assets` partition holds a versioned,
checksummed package of TTF/OTF faces, one per family (max 8), and the device rasterizes each
`size_px` at runtime with LVGL's TinyTTF. Widgets reference `family` + `size_px`: a missing **family**
is a composition error, never a silent fallback, while a new **size** needs neither upload nor
reboot. Faces are copied into external RAM at startup so a later upload can release the flash
mapping while the dashboard renders; glyph bitmaps are cached per font in external RAM and
pre-warmed during composition. The configurator uploads the chosen file unchanged and replaces the
whole package before saving a configuration that needs a new family; installing a package requires a
reboot.

The author never types a family. `family` **is** the id of an entry in the configurator's font
library (`main/font-library/`), which holds faces from three origins — bundled with the app,
downloaded from the checked-in Google Fonts catalog, or imported from a file — and a weight is its
own entry, its own family and one of the eight slots. "Save to board" resolves the document's
families against that library, builds a package holding exactly those, skips the upload when
`@SC:FONT:INFO` reports the same `crc` and `entries`, and saves. It restarts the board only when a
package was actually installed — or when the board already owed a restart for one — because a face
becomes usable only after a restart; otherwise it closes with `@SC:APPLY`, which brings the running
dashboard up to what was just written. An unresolvable family stops the save and asks for a file;
live apply is suppressed while the board lacks a family, because firmware rejects the document
whole. See
[docs/adr/0010-uploaded-font-assets.md](docs/adr/0010-uploaded-font-assets.md).

### Configurator (`configurator/src/`)

Standard electron-vite three-way split: `main/` (Node — serial via `serialport`, device service,
protocol, font, image and firmware upload over one shared `assets/` engine, the `font-library/`
face store and Google Fonts catalog, the `save-to-board/` orchestrator, config files,
the dashboard `templates/` library, the `configs/` folder of saved configurations and the recent-files
list, SimHub profile export), `preload/`, `renderer/src/` (React +
Zustand + Tailwind 4, organized by feature: `configuration`, `debug`, `device`, `firmware-update`,
`font-library`, `image-assets`, `modules`, `protocol`, `templates`). `shared/` holds types
crossing the boundary; all IPC channels and the `SimCoreApi`
surface are declared in [configurator/src/shared/ipc.ts](configurator/src/shared/ipc.ts) — add
channels there, then the main handler in `main/ipc/register-ipc-handlers.ts` and the preload bridge.

`app/workspace/` owns the navigation: a collapsible rail (`WorkspaceRail`) over seven workspaces —
Dashboard, Info, Protocol, Configs, Modules, Firmware, Debug — with the active one, the active
dashboard page and the rail's width kept across restarts in `workspace-store.ts`, and one page
chrome (`PageShell`) so the seven read as one application. Only Dashboard has pages of its own
(`Canvas`, `Templates`, `Fonts`, `Images`), because all four answer what the dashboard is made of.
What the window owns rather than a page — live apply, the serial traffic log, `Cmd`/`Ctrl`+`S`, the
unresolved-fonts dialog — is mounted in `App.tsx`, so leaving a page never stops it.

The editor mutates one sparse draft document; canvas drag/resize, the inspector, and the advanced
JSON editor all write the same document — there is no separate editor-only layout model. The draft
owns its board identity, so it works fully disconnected; device connection and draft have independent
lifetimes ("Reload board" is the explicit discard).

A dashboard moves to another board through `shared/layout-transfer.ts`: every pixel-valued property
scaled, either `contain` (one factor, centred, keeps proportions) or `stretch` (a factor per axis,
fills the display) as the author picks, plus a report of what did not carry (image bitmaps above
all, which the device never rescales). Every entry point goes through `convertDraftToBoard` in
`configuration-actions.ts` — the Configs page's "Convert draft to <board>", the canvas board picker,
and applying a template authored elsewhere — and the fit is one persisted preference in
`panel-store.ts` rather than three copies of local state. Which board is being authored for while
nothing is plugged in lives in the device store (`offlineBoard`), because the canvas and the Configs
page both offer that choice. A template is a whole document inside an envelope, because the
configuration itself may hold no property the contract does not declare. See
[docs/adr/0023-dashboard-templates-and-layout-transfer.md](docs/adr/0023-dashboard-templates-and-layout-transfer.md).

Inside `features/configuration/`, the editor is split three ways and each part has its own
directory. `preview/` draws the canvas: `PreviewCanvas` and its chrome, the pure geometry in
`canvas-geometry.ts`, and one renderer per widget type. Beside them sit the parts a gesture needs —
`snapping.ts`, which is where a move, a resize and a drawn corner all resolve (a neighbour's edge
first, then a gap the row already has, then the grid, within the level the box lives in);
`ToolPalette` and `widget-creation.ts`, which turn a drawn box into a widget; `CanvasStatusBar` for
the zoom and the snapping switches; and `ContextMenu` with the entries it shows in `menu-entries.ts`,
shared with the layer list. `inspector/` is the property panel: the
shell dispatches by widget type into `widget-editors`, over shared `section-editors`,
`styling-editors` and form primitives in `fields.tsx`. Those are laid out by two components — a
folding `Group` with a summary of what it holds, and a `PropertyRow` that puts the name left of
the control, with a dot for a value that differs from the device's own default (`authored.ts`,
deliberately not "the key is present": every repeated row is created carrying its defaults) — and
every explanation is a click on the `InfoHint` beside a name, worded once in `hints.ts` rather than
as prose between the fields. Colours use `ColorPicker` rather than
`<input type="color">`, because the browser draws its own popup outside the document and the
dashboard's existing colours have to be reachable from inside the picker. `editor/` is the document layer — view
state and the active tool in `store.ts`, panel sizes and group folds in `panel-store.ts` and the
snapping preferences in `snap-store.ts` (the editor state kept across restarts), access and mutation
in `document.ts`, and one module per family of commands
(`widgets`, `screens`, `slots`, `clipboard`, `naming`, `palette`, and the arrange family split by
what it arranges: `alignment`, `geometry-commands`, `grouping`, `placement`, `reparent`).
`dashboard-editor.ts` re-exports `editor/` as one surface, so panels keep a single import.

What stays at the feature root is what belongs to none of the three: `DashboardWorkspace.tsx` (the
four dashboard pages and the toolbar over them), `ConfigsPage.tsx` (files, the saved-configuration
library, the draft-versus-board diff and the raw JSON), `configuration-actions.ts` (every command
that replaces the whole document, as plain functions so a keystroke can reach one without a panel
being mounted), `LayersPanel.tsx`, and the `dashboard-editor.ts` barrel. The canvas shell, the
inspector shell and the keyboard commands live in `preview/`, `inspector/` and `editor/` with the
rest of their halves.

Board state that several pages read is a hook or a store rather than one page's local state:
`features/device/draft-state.ts` answers whether the draft parses, differs from the board and could
be saved; `save-to-board-store.ts` holds a save that outlives the button that started it — and the
remount a restart causes; `live-apply-store.ts` holds what the board is currently being told.

## Conventions

- C++20, `.clang-format` is Google style, 100 columns, left pointer alignment, case-sensitive include
  sorting. 2-space indent everywhere (4 in `CMakeLists.txt`), LF, final newline.
- Prefer static allocation, `constexpr`, bounded fixed-size structures; avoid global mutable state,
  heap churn in periodic paths, and blocking work outside dedicated FreeRTOS tasks.
- No central application scheduler: FreeRTOS tasks for blocking work, LVGL timers for rendering,
  event bus callbacks for short module updates.
- The example sparse configurations live in `configurator/src/main/templates/bundled/`,
  wrapped in the template envelope and inlined into the main bundle. They are starting
  points offered by the template library, not inheritance profiles.
