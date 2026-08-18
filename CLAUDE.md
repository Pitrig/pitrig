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

Requires a sourced ESP-IDF environment (`source <idf-path>/export.sh`). Run from `firmware/`. Each
board is a separate build directory + generated sdkconfig; always pass both `-DSDKCONFIG` and
`-DSDKCONFIG_DEFAULTS` so board defaults are not lost.

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

Two generators own checked-in code. Both accept `--check`, which reports staleness without
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
  Contains no hardware-specific and no feature-specific code. `core/module_manager` holds
  compile-time descriptors (function pointers + explicit contexts); no allocation, no name lookup.
- `interfaces/` — small contracts (`display`, `input`, `transport`) implemented by drivers. The
  `display` and `input` contracts live in one `interfaces` component; `transport` is its own.
- `components/` — reusable hardware capabilities (`display`, `input`); depend on interfaces, never
  on concrete drivers.
- `drivers/` — board/hardware implementations (`t_display_s3`, `guition_esp32_4848s040`,
  `guition_jc1060p470c`, `touch/gt911`, `transport/uart`, `transport/usb_cdc`,
  `transport/usb_serial_jtag`, plus `transport/transport_common` for the read counters and log
  silencing every link shares). No application logic. A board with no digitizer leaves
  `BoardDefinition::input` null.
- `modules/` — user-visible functionality (`lap_timer`). Must not depend on platform
  code or LVGL, and must not touch hardware directly.
- `services/` — shared infrastructure (`asset_control`, `asset_package`, `asset_storage`,
  `binary_session`, `configuration`, `configuration_contract`, `configuration_control`,
  `event_bus`, `font_assets`, `font_asset_control`, `font_contract`, `image_assets`,
  `image_asset_control`, `image_contract`, `logger`, `performance`, `telemetry` +
  `telemetry/protocols/simhub`). `asset_control` is the `SCF1` upload engine;
  `font_asset_control` and `image_asset_control` are thin per-kind wrappers over it that supply
  the protocol tag and the body of the `INFO` reply. `asset_package` holds what the two package
  formats share — the 32-byte header, its validation, and the update status and error types —
  while each kind keeps its own magic, manifest entry decoder and catalog.
- `platform/` — framework/board-specific wiring: `board_registry`, `communication`,
  `dashboard` (LVGL `widgets` over a shared `frame`, plus `conditions`, `fonts`, `images`,
  `layout`, `navigation` for screen swiping, `slots` for container switching, and `utilities`),
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
(display bounds, allowed UART pins). Firmware reports only the stable board identifier; the
configurator maps it to a local board profile for logical display dimensions. User configuration must
carry a matching `board` or it is rejected. Saving requires a reboot; `APPLY` rebuilds the running dashboard from a document without writing
storage, which is what the configurator's live preview uses.

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

### Uploaded assets

Fonts and images are both uploaded, never compiled in, and they share everything
except their package format: one 4 MiB `image_assets` partition beside the 2 MiB
`font_assets` one, the `asset_storage` contract under both, the `SCF1` frames
over `@SC:FONT:` / `@SC:IMAGE:`, and a single `binary_session::Claim` that
decides which one owns the serial link — a second upload is answered `busy`
rather than raced. Images are converted **in the configurator** to the LVGL
layout and the size they are drawn at; the device holds no decoder and neither
scales nor rotates. See [docs/image-assets.md](docs/image-assets.md) and
[docs/adr/0018-uploaded-image-assets.md](docs/adr/0018-uploaded-image-assets.md).

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

### Configurator (`configurator/src/`)

Standard electron-vite three-way split: `main/` (Node — serial via `serialport`, device service,
protocol, font and image upload over one shared `assets/` engine, config files, SimHub profile
export), `preload/`, `renderer/src/` (React + Zustand + Tailwind 4, organized by feature:
`configuration`, `device`, `font-assets`, `image-assets`, `simhub`, `development`). `shared/` holds types crossing the boundary; all IPC channels and the `SimCoreApi`
surface are declared in [configurator/src/shared/ipc.ts](configurator/src/shared/ipc.ts) — add
channels there, then the main handler in `main/ipc/register-ipc-handlers.ts` and the preload bridge.

The editor mutates one sparse draft document; canvas drag/resize, the inspector, and the advanced
JSON editor all write the same document — there is no separate editor-only layout model. The draft
owns its board identity, so it works fully disconnected; device connection and draft have independent
lifetimes ("Reload board" is the explicit discard).

Inside `features/configuration/`, the editor is split three ways and each part has its own
directory. `preview/` draws the canvas: `PreviewCanvas` and its chrome, the pure geometry in
`canvas-geometry.ts`, and one renderer per widget type. `inspector/` is the property panel: the
shell dispatches by widget type into `widget-editors`, over shared `section-editors`,
`styling-editors` and form primitives in `fields.tsx`. `editor/` is the document layer — view
state in `store.ts`, access and mutation in `document.ts`, and one module per family of commands
(`widgets`, `screens`, `arrange`, `slots`, `clipboard`, `naming`, `palette`).
`dashboard-editor.ts` re-exports `editor/` as one surface, so panels keep a single import.

Not everything has landed in that split yet: `ConfigurationPanel.tsx`, `DisplayPreview.tsx`,
`LayersPanel.tsx`, `WidgetInspector.tsx`, `use-editor-shortcuts.ts`, `preview-assets.ts` and
`text-metrics.ts` still sit at the feature root.

## Conventions

- C++20, `.clang-format` is Google style, 100 columns, left pointer alignment, case-sensitive include
  sorting. 2-space indent everywhere (4 in `CMakeLists.txt`), LF, final newline.
- Prefer static allocation, `constexpr`, bounded fixed-size structures; avoid global mutable state,
  heap churn in periodic paths, and blocking work outside dedicated FreeRTOS tasks.
- No central application scheduler: FreeRTOS tasks for blocking work, LVGL timers for rendering,
  event bus callbacks for short module updates.
- `config/*.json` are example sparse configurations, not inheritance profiles.
