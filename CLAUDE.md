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

Debug/diagnostics builds append `;sdkconfig.defaults.debug` to `SDKCONFIG_DEFAULTS` **and** require
`#define SIMCORE_DEBUG 1` in `firmware/components/simcore_config/include/simcore_features.hpp` (see
[docs/runtime-performance.md](docs/runtime-performance.md)). The same VS Code tasks exist in
[.vscode/tasks.json](.vscode/tasks.json) ("SimCore: Build …").

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

### Telemetry catalog (generated code — never hand-edit outputs)

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
- `interfaces/` — small contracts (`display`, `transport`) implemented by drivers.
- `components/` — reusable hardware capabilities (`display`, `simcore_config`); depend on interfaces,
  never on concrete drivers.
- `drivers/` — board/hardware implementations (`t_display_s3`, `guition_esp32_4848s040`,
  `guition_jc1060p470c`, `transport/uart`, `transport/usb_cdc`). No application logic.
- `modules/` — user-visible functionality (`delta_time`, `lap_timer`). Must not depend on platform
  code or LVGL, and must not touch hardware directly.
- `services/` — shared infrastructure (`configuration`, `configuration_contract`,
  `configuration_control`, `event_bus`, `font_assets`, `font_asset_control`, `font_contract`,
  `logger`, `performance`, `telemetry` + `telemetry/protocols/simhub`).
- `platform/` — framework/board-specific wiring: `board_registry`, `communication`,
  `dashboard` (LVGL widgets), `dashboard_composition`, `module_composition`, `nvs_config_storage`,
  `partition_font_asset_storage`, `telemetry_transport`, `external_memory`.
- `utils/` — dependency-free helpers (`binary`, `transformers/time_transform`).

Every layer directory listed above is a separate ESP-IDF component registered in
`EXTRA_COMPONENT_DIRS` in [firmware/CMakeLists.txt](firmware/CMakeLists.txt) — **adding a new
component/module/driver requires adding its path there** (and the P4-vs-S3 branch for board drivers).
Public headers live in `include/`, sources in `src/`.

Extension order: add a module first, reuse existing components/services, add a component only for a
new hardware capability, add a driver only for new hardware. The core should rarely change.

### Board identity vs. user configuration

A firmware build owns exactly one immutable `BoardDefinition` selected by
`CONFIG_SIMCORE_FACTORY_BOARD_*` (set by the `sdkconfig.defaults.<board>` file). It binds board id,
display driver, default telemetry transport, factory payload, and private validation metadata
(display bounds, allowed UART pins). Firmware reports only the stable board identifier; the
configurator maps it to a local board profile for logical display dimensions. User configuration must
carry a matching `board` or it is rejected. Config is immutable at runtime — saving requires reboot.

Config load order: valid NVS slot A → valid NVS slot B → compiled factory config (board id only,
which yields an enabled display with an empty dashboard). NVS record format (magic, generation,
CRC32, dual slot in the `simcore_cfg` partition) is private to the configuration service; the
configurator must not depend on it.

### Configuration schema 2

Sparse JSON, used unchanged for both configurator projects and the device wire payload — omitted
properties are *not* expanded through board profiles. Widget geometry is absolute logical display
pixels (no regions/anchors). Bounded limits (16 KB payload, 16 text widgets, 4 modifiers per widget,
byte limits on strings) and the full property table are in
[docs/device-configuration.md](docs/device-configuration.md) — read it before touching config code on
either side. The contract itself lives in the `configuration_contract` service component (no storage,
no protocol, no LVGL) and mirrors into `configurator/src/shared/`.

### Value pipeline (bindings → modifiers → transform)

Widgets never know telemetry field names or protocol IDs. Telemetry ingestion splits into an
immutable registry (protocol-neutral names/types), one-time startup binding of protocol source IDs to
handles, and mutable state in fixed slots. A startup-only widget binder hands each widget a pre-bound
typed callback; stateful modifiers (e.g. `lap_timer`) are module code behind that callback, and pure
transforms live in `utils/transformers`. Periodic paths perform no name lookup and no allocation. See
ADRs 0003, 0005, 0012.

### Communication

One serial transport is shared by three concerns, arbitrated by the router in
`platform/communication`: line-oriented SimHub telemetry, the line-oriented `@SC:` configuration
control protocol (`INFO`, `GET`, `VALIDATE`, `SET`, `RESET`, `REBOOT`), and a temporary binary
stop-and-wait mode for font package upload. `core` receives only `ITransport` and knows nothing about
UART, USB CDC, or SimHub. See [docs/simhub-custom-serial.md](docs/simhub-custom-serial.md) and
[docs/font-assets.md](docs/font-assets.md).

### Fonts

Production firmware compiles **no** dashboard fonts. Widgets reference `family` + `size_px`, resolved
exactly against a separately versioned, checksummed package in the `font_assets` partition — a miss
is a composition error, never a silent fallback. The configurator converts TTF/OTF via `lv_font_conv`
and replaces the whole package before saving a configuration that needs new fonts. Installing a
package requires a reboot.

### Configurator (`configurator/src/`)

Standard electron-vite three-way split: `main/` (Node — serial via `serialport`, device service,
protocol, font upload, config files, SimHub profile export), `preload/`, `renderer/src/` (React +
Zustand + Tailwind 4, organized by feature: `configuration`, `device`, `font-assets`, `simhub`,
`development`). `shared/` holds types crossing the boundary; all IPC channels and the `SimCoreApi`
surface are declared in [configurator/src/shared/ipc.ts](configurator/src/shared/ipc.ts) — add
channels there, then the main handler in `main/ipc/register-ipc-handlers.ts` and the preload bridge.

The editor mutates one sparse schema-2 draft; canvas drag/resize, the inspector, and the advanced
JSON editor all write the same document — there is no separate editor-only layout model. The draft
owns its board identity, so it works fully disconnected; device connection and draft have independent
lifetimes ("Reload board" is the explicit discard).

## Conventions

- C++20, `.clang-format` is Google style, 100 columns, left pointer alignment, case-sensitive include
  sorting. 2-space indent everywhere (4 in `CMakeLists.txt`), LF, final newline.
- Prefer static allocation, `constexpr`, bounded fixed-size structures; avoid global mutable state,
  heap churn in periodic paths, and blocking work outside dedicated FreeRTOS tasks.
- No central application scheduler: FreeRTOS tasks for blocking work, LVGL timers for rendering,
  event bus callbacks for short module updates.
- `config/*.json` are example sparse configurations, not inheritance profiles.
