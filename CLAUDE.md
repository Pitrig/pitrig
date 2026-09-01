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

**The build-directory argument is read as a path from the current directory**, because the script
looks for `<argument>/CMakeCache.txt` — so it is `source tools/idf-env.sh firmware/build-x` from the
root, or `cd firmware && source ../tools/idf-env.sh build-x`. A bare name from the root used to find
nothing and fall back to the default virtualenv; the script now prints both correct forms and
returns 1 instead, because that fallback is right for six of the eight build directories and wrong
for the two P4 render profiles, which carry the other virtualenv. A build directory that does not
exist yet still passes quietly.

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

```bash
cd firmware && idf.py -B build-devkit -DIDF_TARGET=esp32s3 -DSDKCONFIG=sdkconfig.generated.devkit -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.esp32s3-devkit" build
```

The DevKitC-1 is the board with **no display**: `BoardDefinition::display` and
`input` are null, a `dashboard` section on it is rejected rather than ignored,
and its only visible output is the addressable lamp `BoardDefinition::status_led`
names. That lamp moved between board revisions, so which pin it is on is a
Kconfig choice (`SIMCORE_STATUS_LED_GPIO38` / `_GPIO48`) rather than a guess.

Debug builds append `;sdkconfig.defaults.debug` to `SDKCONFIG_DEFAULTS`, which selects
`CONFIG_SIMCORE_DEBUG`. Feature selection is Kconfig-driven; no source header is edited (see
[docs/runtime-performance.md](docs/runtime-performance.md)). A debug build is the product **plus
observation and nothing else** — it must never change product behaviour, or what it measures is not
what ships (ADR 0028).

A P4 build is tear-free by default: it composes the frame from internal-RAM strips
(`CONFIG_SIMCORE_DISPLAY_RENDER_FULL_STRIPS`, L2 stays 256 KB — the strips need the internal RAM —
with 128-byte lines). It may append `;sdkconfig.defaults.render-partial` for the faster
seam-accepting mode, or `;sdkconfig.defaults.render-full` for the whole-frame PSRAM mode, which
pairs with the 512 KB L2 cache ADR 0027 measured it against.

Flash and monitor use the same `-B` build directory, e.g.
`idf.py -B build-t-display -p <port> flash monitor`.

Switching boards means switching `IDF_TARGET`; `esp32p4` uses `dependencies.lock.esp32p4` and applies
LVGL PPA / DSI patches from `firmware/cmake/`.

### Continuous integration

[.github/workflows/build.yml](.github/workflows/build.yml) runs on a push to `release` and on
demand: `checks` (the three generators with `--check`, `check_debug_isolation.py --check`, then
the configurator's typecheck and lint), then `configurator` (electron-builder on macOS, Windows and
Linux runners: `dmg`, `nsis`, `AppImage` and `deb`) and `firmware` (three boards in
`espressif/idf:v6.0.2`), then a **draft** GitHub release holding the installers, the three OTA
images and a per-board archive. Every packaged application is checked for debug traces before it is
uploaded: the ESLint boundary of ADR 0028 keeps `src/debug` out of the product sources, and the
`app.asar` grep keeps a packaging mistake from shipping it anyway. Nothing signs the applications,
so macOS needs `xattr -dr com.apple.quarantine` and Windows shows a SmartScreen warning.

The two halves carry **separate versions**: `configurator/package.json` versions the desktop
application and names the release tag, while `firmware/version.txt` is the board's own — ESP-IDF
reads it into `PROJECT_VER`, and it is what `@SC:INFO` and the OTA status report. Without that file
the firmware version is whatever `git describe` returns, which is a bare commit id.

The firmware job runs `reconfigure` **twice** before `build`, and a clean checkout needs it:
`firmware/cmake/` patches `managed_components` during configuration, which is after ESP-IDF has
already collected component requirements — so the first configure of a fresh tree records the
*unpatched* `esp_lvgl_port` requirements and the P4 build then fails on `esp_cache.h`. The second
configure re-reads the patched file. A working tree that has built P4 before does not show this,
because its `managed_components` is already patched — which is also why
`apply_esp_lvgl_port_dsi_patch.cmake` is applied for **every** target rather than only for the P4:
the patch is what declares `full_strips`, and `components/display` sets that flag on every board.

### VS Code tasks

[.vscode/tasks.json](.vscode/tasks.json) carries every command above, each sourcing the environment
for its own build directory: ten `SimCore: Build …` tasks (four boards, their debug profiles and
the two P4 render profiles), `SimCore: Build All Firmware` (runs them in sequence, esp32s3 first so
the `IDF_TARGET` switch happens once), `SimCore: Flash` / `Monitor` / `Flash and Monitor` over a
picked build directory, `SimCore: Check Generated Contracts` and `Regenerate Contracts`,
and `Configurator: …` / `Debugger: …` for both Electron applications. There is deliberately no
default build task: with ten configurations, the picker is the honest answer.

**The port is chosen, not typed.** The three serial tasks run
[tools/pick-serial-port.py](tools/pick-serial-port.py), which lists the ports that are actually
present with what each one is — the JTAG unit you flash through, the board's own `SimCore` CDC link
you do not — stars the flashable one as the default, and offers `auto` to let esptool find the
board. It prompts on stderr and prints only the chosen device on stdout, so the task captures it
with `$(…)`. A single port is taken without asking, and a non-interactive run falls back to `auto`.
This replaced a hardcoded `/dev/cu.usbmodem101`: macOS numbers `usbmodem` ports by which USB socket
the board is in, so any remembered name goes stale the moment the cable moves. `SIMCORE_PORT`
overrides the prompt. The script prefers pyserial, which the sourced ESP-IDF environment already
provides, and falls back to listing `/dev` without the descriptions.

### Configurator (Electron + React 19 + TypeScript, pnpm)

```bash
cd configurator && pnpm install && pnpm run dev
```

The debugger is a second application from the same package:

```bash
cd configurator && pnpm run dev:debug
```

```bash
cd configurator && pnpm run typecheck
```

```bash
cd configurator && pnpm run lint
```

`pnpm run build` runs typecheck then `electron-vite build`; `pnpm run build:debug` does the same for
the debugger into `out-debug/`. `typecheck` covers three projects — node, the product renderer, and
the debug renderer. There is no test runner.

`pnpm run package` builds and then wraps the product in `electron-builder.yml` (`dist/`);
`pnpm run package:debug` does the same for the debugger through `electron-builder.debug.yml`
(`dist-debug/`), which points `main` at `out-debug/` through `extraMetadata`. Both take their icon
from `resources/icon.png` and neither is code-signed (`identity: null`).

Every dependency whose install script must run is listed in `allowBuilds` in
[configurator/pnpm-workspace.yaml](configurator/pnpm-workspace.yaml), and **`electron` is one of
them**: its install script is what downloads the binary, so without the entry `pnpm run dev` fails
with `Error: Electron uninstall` while packaging still works — electron-builder fetches its own
copy. An unanswered entry (pnpm writes `set this to true or false` when it meets a new one) makes
every `pnpm run` fail until it is decided.

### Debug isolation

```bash
python3 tools/check_debug_isolation.py --check
```

Records the `#if SIMCORE_DEBUG` hooks production firmware carries and fails when the set changes.
Run it without `--check` to accept a deliberate change. See ADR 0028.

### Generated contracts (never hand-edit outputs)

Three generators own checked-in code. Each is a package under `tools/codegen/`, run with `python3
-m` **from the repository root** — the module path is what resolves the package. All accept
`--check`, which reports staleness without writing.

`configuration/configuration_schema.json` is the configuration contract:

```bash
python3 -m tools.codegen.configuration_schema
```

Outputs: `firmware/services/configuration_contract/include/application_configuration_generated.hpp`,
`firmware/services/configuration/include/configuration_schema_generated.hpp`,
`configurator/src/shared/configuration-schema.ts`, `docs/configuration-schema.md`.

### Telemetry catalog

`telemetry/telemetry_catalog.json` and `telemetry/simhub_generic_mappings.json` are the sources.
Regenerate all consumers together:

```bash
python3 -m tools.codegen.telemetry_catalog
```

Outputs: `firmware/services/telemetry/include/telemetry_catalog_generated.hpp`,
`firmware/services/telemetry/protocols/simhub/include/simhub_catalog_generated.hpp`,
`configurator/src/shared/telemetry-catalog.ts`, `configurator/src/shared/simhub-profile-data.ts`,
`docs/telemetry-catalog.md`, `simhub/SimCore-telemetry.shsds`.

### LED bitmap fonts

`fonts/led_bitmap_font.json` holds the two faces a matrix draws text with, as
rows of `#` and space:

```bash
python3 -m tools.codegen.led_font
```

Outputs: `firmware/components/led/include/led_font_generated.hpp`,
`configurator/src/shared/led-font.ts`. Both sides need the same glyphs — the
firmware to draw them and the configurator to preview them — which is why they
are generated rather than kept in step by hand.

### Google Fonts catalog

`fonts/google_fonts_snapshot.json` (fetched from Google, no API key) and
`fonts/google_fonts_selection.json` (the curation rules) are the sources:

```bash
python3 -m tools.codegen.font_catalog
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
- `components/` — reusable hardware capabilities (`display`, `input`, `led`); depend on
  interfaces, never on concrete drivers, and on no service either — `led` therefore
  knows nothing of the configuration contract and the module translates for it.
- `drivers/` — board/hardware implementations (`t_display_s3`, `guition_esp32_4848s040`,
  `guition_jc1060p470c`, `touch/gt911`, `transport/uart`, `transport/usb_cdc`,
  plus `transport/transport_common` for the read counters every link
  shares and the log silencing the console-port link uses). Each board has exactly one link.
  `led/ws2812_rmt` drives one RMT transmit channel per output, which is why four
  outputs is the ceiling on both chips.
  `transport/usb_cdc` owns the whole native USB device: on a board that has one it enumerates as a
  composite CDC serial port **and** an HID gamepad (`usb_gamepad.hpp`), selected by
  `CONFIG_TINYUSB_HID_COUNT` in the board defaults. No application logic. A board with
  no digitizer leaves `BoardDefinition::input` null.
- `modules/` — user-visible functionality (`lap_timer`, `rgb_leds`). Must not depend
  on platform code or LVGL, and must not touch hardware directly. `rgb_leds` owns
  the addressable LED outputs: it turns the `hardware` section into chains, binds
  each layer once, and repaints on its own 60 Hz task, because the event-bus
  handler runs on the transport read task and blocking it stalls telemetry for
  the dashboard as well. Layers are painted in order and a later one overwrites
  the lamps it covers — deliberately the opposite of a widget's first-match
  styling rules (ADR 0030).
- `services/` — shared infrastructure (`asset_control`, `asset_package`, `asset_storage`,
  `binary_session`, `boot_guard`, `configuration`, `configuration_contract`,
  `configuration_control`, `event_bus`, `firmware_update`, `font_assets`, `font_asset_control`,
  `font_contract`, `image_assets`, `image_asset_control`, `image_contract`, `logger`,
  `telemetry` + `telemetry/protocols/simhub`, `value_conditions`). `value_conditions` is the
  LVGL-free rule resolver — it was inside the `dashboard` platform component until an LED
  layer needed it, and a module may depend on a service but not on platform code
  (ADR 0030); call sites are unchanged because unqualified `conditions::` still
  resolves from inside `simcore::dashboard`.
  `asset_control` is the `SCF1` upload engine;
  `font_asset_control`, `image_asset_control` and `firmware_update` are thin per-kind wrappers
  over it that supply the protocol tag and the body of the `INFO` reply. `firmware_update` is one
  component rather than a service plus a wrapper, because nothing reads a firmware image at
  runtime the way the dashboard reads faces and bitmaps. `asset_package` holds what the package
  formats share — the 32-byte header, its validation, and the update status and error types —
  while each kind keeps its own magic, manifest entry decoder and catalog.
- `platform/` — framework/board-specific wiring: `board_registry`, `communication`,
  `dashboard` (LVGL `widgets` over a shared `frame`, plus `conditions`, `fonts`, `images`,
  `layout`, `navigation` for screen swiping, `slots` for container switching, `value_text` for
  turning one value into the text a widget draws, `memory` for the allocator that puts **every**
  LVGL allocation in external RAM, `utilities`, and the embedded boot-splash
  `assets`),
  `dashboard_composition`, `module_composition`, `nvs_config_storage`,
  `partition_asset_storage`, `status_light`, `telemetry_transport`, `external_memory`.
  `status_light` drives the single board-declared lamp: it needs no configuration, so
  it runs on the recovery surface where no module composes, and reports booting, safe
  mode, telemetry silence and upload progress.
- `utils/` — helpers with no dependency on any other layer (`binary`, `simcore_config`,
  `transformers/number_transform`, `transformers/text_writer`, `transformers/time_transform`).
  `simcore_config` is the Kconfig surface and the `SIMCORE_*` feature aliases; it lives here
  because every layer reads it, and it sat under `components/` long enough to give drivers and
  services a dependency on a component, which the layering forbids.
- `debug/` — everything that exists only to observe the product (`performance`,
  `diagnostics_command`, `overlays`, `instrumentation`). Each component registers with empty
  `SRCS` and empty `INCLUDE_DIRS` unless `CONFIG_SIMCORE_DEBUG`, so a production build compiles
  none of it — and cannot compile an unguarded `#include "performance.hpp"` either. Requirements
  on these components stay **unconditional**: ESP-IDF resolves requirements in an early pass where
  `CONFIG_*` is not yet known, so the component turns itself off rather than its callers.
  Production code keeps only one-line `#if SIMCORE_DEBUG` hooks, and
  `python3 tools/check_debug_isolation.py --check` fails when their number changes.

Every layer directory listed above is a separate ESP-IDF component. All of them except
`components/` are registered in `EXTRA_COMPONENT_DIRS` in
[firmware/CMakeLists.txt](firmware/CMakeLists.txt) — **adding a new service/module/driver requires
adding its path there** (and the P4-vs-S3 branch for board drivers). `components/` is ESP-IDF's own
default search path and needs no entry. Public headers live in `include/`, sources in `src/`.

Extension order: add a module first, reuse existing components/services, add a component only for a
new hardware capability, add a driver only for new hardware. The core should rarely change.

### Startup order and safe mode

The phases are `boot guard → configuration → link + control protocol → display → assets →
modules + dashboard → composed → complete`, and the order is the decision (ADR 0025). **The serial
link comes up before the display and before anything is composed**, so everything a board can be
repaired with sits ahead of everything a board can be broken by. Only the configuration stays ahead
of it, because the `protocol` document picks the port, pins and baud rate. Starting a link waits for
no host — it installs a driver and creates a read task — so a board with nothing plugged in passes
the phase in milliseconds.

A crashed task here is a panic that resets the chip; there is no isolating one. `boot_guard` counts
crashes and watchdog resets in RTC memory (survives a panic reset, cleared on power-on), and three
in a row put the next boot on the **recovery surface**: transport, `@SC:` control and `@SC:FW:`
upload, and nothing else — no display, no LVGL, no dashboard, no modules, no font/image upload, no
telemetry decode, and the board's own `protocol` document rather than the stored one. `APPLY`
answers `unsupported` there. The count is cleared by the first document a host writes or erases
(`SET` or `RESET`), so both an ordinary "save to board" and a factory reset are ways out; it is *not* cleared when startup ends but ten seconds
later, or a fault firing just after composition would reset it every time and never reach the
threshold. `@SC:INFO` reports `safe_mode`, `boot_failures`, `reset_reason` and `last_phase`.

Consequences to respect when touching startup: `mark_running_image_valid()` now fires as soon as the
link is up (rollback catches only an image that cannot be talked to); `display::initialize()`
returns `nullptr` instead of aborting; a `SET`/`APPLY`/`RESET` arriving before composition waits on
an event bit and is answered `busy` after ten seconds, while reads and `REBOOT` never wait;
`binary_session::Claim` stays closed until composition so an upload cannot erase a partition
startup is still copying out of (`BEGIN`/`CLEAR` answer `busy`, they do not wait); and log
silencing happens at the end of startup rather than when the link starts. The task watchdog resets
(`CONFIG_ESP_TASK_WDT_PANIC`, 10 s, idle checks off) and watches only tasks that feed it — each
link's read task, and the render trigger, whose LVGL-lock probe is what catches a wedged LVGL task.

### Board identity vs. user configuration

A firmware build owns exactly one immutable `BoardDefinition` selected by
`CONFIG_SIMCORE_FACTORY_BOARD_*` (set by the `sdkconfig.defaults.<board>` file). It binds board id,
display driver, default telemetry transport, one factory payload **per configuration document**,
and private validation metadata (display bounds, the board's UART pin pair). Firmware reports only
the stable board identifier; the configurator maps it to a local board profile for logical display
dimensions. Every configuration document must carry a matching `board` or it is rejected. `SET`
writes NVS and answers `reboot_required` from the document's own schema entry — 1 for `protocol`,
0 for the others; `APPLY` rebuilds the running composition from one document without writing
storage, which is what the configurator's live preview uses — and what a save pairs with `SET` so an
ordinary save costs no restart.

Config load order: the three compiled factory documents, then each stored record on top of its own
(ADR 0024). A document with no record runs its factory value while the others run what was saved;
board id alone yields an enabled display with an empty dashboard. NVS record format (magic,
per-document generation, CRC32, one key per document in the `simcore_cfg` partition) is private to
the configuration service; the configurator must not depend on it.

### Configuration documents

The configuration is **three documents**, not one: `dashboard` (`board` +
`dashboard`), `modules` (`board` + `hardware`, empty until a peripheral driver has a contract) and
`protocol` (`board` + `telemetry_transport`). Each is transferred, stored, validated and applied on
its own — `@SC:GET:<doc>`, `@SC:SET:<doc>:<json>`, one NVS record and generation each, its own
payload bound (128 KB / 1 KB / 1 KB) and its own answer to whether a restart is owed. They are
declared in the `documents` block of `configuration/configuration_schema.json`, which must partition
every serialized root section, and the generator emits the enum, key allow-lists, bounds and restart
flags for both firmware and configurator. In memory they are still one `ApplicationConfiguration`, so
a rule spanning sections stays one check; on disk and in the editor the aggregate is still one file.
See [docs/adr/0024-separate-configuration-documents.md](docs/adr/0024-separate-configuration-documents.md).

### Configuration schema

Sparse JSON, used unchanged for both configurator projects and the device wire payload — omitted
properties are *not* expanded through board profiles. Widget geometry is absolute logical display
pixels, except inside a **container**, where it is relative to the container's box (ADR 0021). A
**shape** widget is the drawing container: it may hold widgets, including other shapes, nested up to
`kMaximumNestingDepth`. A container clips its children unless `clip_children` says
otherwise — a widget's own caption is drawn on the parent, so it is never cut by
its own clip. A dashboard holds up to four
screens, swiped between on a board with touch, and its `transition` says whether
a move between them slides or lands in one frame — the slide composites both
screens for every frame it runs, which a full screen of widgets cannot always
afford (ADR 0020). A **slot** widget is an area that switches
what it shows: it draws nothing, is authored only on a screen, and holds up to `kMaximumSlotPages`
pages of which one is visible — a tap cycles the pages that are `in_loop`, and a page whose
`trigger` fires (`conditions` over `source`, or `value_changed`) is raised over the loop for its
`duration_ms`, first page in the array winning. An **image** widget may draw one frame of a sprite
sheet — several pictures uploaded as one asset — picked by `sprite_frame` or from telemetry through
`sprite_frame_source`; it is the only widget property whose range comes from an uploaded asset
rather than from the contract. Any widget may
carry an `action`, so a tap navigates to the next, previous, or a named screen; an empty
transparent shape with an action is an invisible touch zone. Bounded limits (128 KB payload, dashboard-wide per-type widget pools that together outsize both
the 255 references one screen can address and the widgets one payload can carry, 4 modifiers per
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
except their package format: one 7 MiB `image_assets` partition beside the 3 MiB
`font_assets` one, the `asset_storage` contract under both, the `SCF1` frames
over `@SC:FONT:` / `@SC:IMAGE:`, and a single `binary_session::Claim` that
decides which one owns the serial link — a second upload is answered `busy`
rather than raced. Images are converted **in the configurator** to the LVGL
layout and the size they are drawn at; the device holds no decoder and neither
scales nor rotates. Their pixels are stored **deflated** and inflated once at
startup into the external RAM they were going to be copied into anyway, so the
artwork's size lands on flash and the draw path is unchanged — `tinfl_decompress`
is in ROM on both chips. External RAM holds only the images the running
configuration **draws**, rebuilt on every replacement while the dashboard is
down; an installed image nothing shows costs nothing but flash. A source with no
transparent pixel is offered `rgb565` rather than `rgb565a8`, which is a third
off both memories at once. An entry may hold several **frames** of one geometry,
stored whole and back to back, which is a sprite sheet. Indexed colour is
reserved rather than supported: LVGL expands it to ARGB8888 per line on every
repaint and loses the P4 accelerator. See
[docs/image-assets.md](docs/image-assets.md) and
[docs/adr/0018-uploaded-image-assets.md](docs/adr/0018-uploaded-image-assets.md).

Firmware travels the same way under `@SC:FW:` and takes the same claim. The
partition table carries two 2.5 MiB application slots and no `factory`: an
upload fills the one that is not running, `@SC:REBOOT` starts it, and rollback returns
to the previous slot if startup does not finish. The image is wrapped in the
same 32-byte header with a manifest naming the `BoardId`, because ESP-IDF checks
the chip and both S3 boards are the same chip. Changing the partition table is a
full `erase-flash` over a cable — the one thing an update cannot deliver, so
the table allocates the whole 16 MiB part and declares `coredump` and `reserve`
empty rather than leaving a tail no shipped board could ever be given.
See [docs/ota.md](docs/ota.md) and
[docs/adr/0022-over-the-air-firmware-updates.md](docs/adr/0022-over-the-air-firmware-updates.md).

### Fonts

Production firmware compiles **no** dashboard fonts. The `font_assets` partition holds a versioned,
checksummed package of TTF/OTF faces, one per family (max 8), and the device rasterizes each
`size_px` at runtime with LVGL's TinyTTF. Widgets reference `family` + `size_px`: a missing **family**
is a composition error, never a silent fallback, while a new **size** needs neither upload nor
reboot. Faces are copied into external RAM at startup so a later upload can release the flash
mapping while the dashboard renders; glyph bitmaps are cached per font in external RAM and
pre-warmed during composition. A distinct `(family, size_px)` pair is what a dashboard actually
spends memory on — 4–12 KB of external RAM each — and since ADR 0026 it costs no internal RAM at
all, so how many of them a board can hold is bounded by external RAM rather than by a wall it used
to hit at twenty-four. The configurator uploads the chosen file unchanged and replaces the
whole package before saving a configuration that needs a new family; installing a package requires a
reboot.

The author never types a family. `family` **is** the id of an entry in the configurator's font
library (`main/font-library/`), which holds faces from three origins — bundled with the app,
downloaded from the checked-in Google Fonts catalog, or imported from a file — and a weight is its
own entry, its own family and one of the eight slots. "Save to board" writes only the documents that
differ from the board, protocol first and dashboard last. When the dashboard is among them it
resolves that document's families against the library, builds a package holding exactly those, and
skips the upload when `@SC:FONT:INFO` reports the same `crc` and `entries`. It restarts the board
only when a package was actually installed, when the board already owed a restart for one, or when
the `protocol` document was written — a face becomes usable only after a restart, and a transport is
selected once at startup, so writing that document answers `reboot_required=1`; otherwise it closes
with `@SC:APPLY` for each document it wrote, which brings the running composition up to what was
just written. An unresolvable family stops the save and asks for a file;
live apply is suppressed while the board lacks a family, because firmware rejects the document
whole. See
[docs/adr/0010-uploaded-font-assets.md](docs/adr/0010-uploaded-font-assets.md).

### Configurator (`configurator/src/`)

Standard electron-vite three-way split: `main/` (Node — serial via `serialport`, device service,
protocol, font, image and firmware upload over one shared `assets/` engine, the `font-library/`
face store and Google Fonts catalog, the `save-to-board/` orchestrator, config files,
the dashboard `templates/` library, the `configs/` folder of saved configurations and the recent-files
list, SimHub profile export), `preload/`, `renderer/src/` (React +
Zustand + Tailwind 4, organized by feature: `configuration`, `device`, `firmware-update`,
`font-library`, `image-assets`, `modules`, `protocol`, `templates`). `shared/` holds types
crossing the boundary; all IPC channels and the `SimCoreApi`
surface are declared in [configurator/src/shared/ipc.ts](configurator/src/shared/ipc.ts) — add
channels there, then the main handler in `main/ipc/register-ipc-handlers.ts` and the preload bridge.

Both applications are branded from `src/main/branding.ts`: the name is `SimCore` (dock, menu bar,
`process.title` and the footer's `app.getName()`), the icon is `resources/icon.png` — rendered from
`assets/branding/` at the repository root, which stays the master — and the header carries the
one-line wordmark (`wordmark.svg`, the icon's own letterforms with `core` scaled to `sim` and both
set on one baseline) rather than a title. Naming the application moves `userData`, so the same module moves a
`@simcore/configurator` directory left by an earlier build onto the new path, and refuses to when
the new one already holds anything.

`src/debug/` is a **second Electron application** built from the same package: `pnpm run dev:debug`
(`electron.vite.debug.config.ts` → `out-debug/`) against `pnpm run dev` (`out/`). It holds the
serial console, the telemetry bench and the `@SC:DIAG` charts, and carries firmware upload and raw
document editing of its own because one serial port admits one process. It reuses the product by
composing `createAppServices()` and calling `registerIpcHandlers()` plus its own
`registerDebugHandlers()`, and extends the bridge as `SimCoreDebugApi`. The dependency runs **one
way** — `src/debug/**` may import anything; `src/main`, `src/preload`, `src/renderer` and
`src/shared` may not import `src/debug`, which an ESLint `no-restricted-imports` rule enforces.
See [ADR 0028](docs/adr/0028-debug-build-and-debug-application-boundary.md).

`app/workspace/` owns the navigation: a collapsible rail (`WorkspaceRail`) over six workspaces —
Dashboard, Modules, Protocol, Configs, Firmware, Info, ordered once in
`WORKSPACE_TABS` so the rail and the `Cmd`/`Ctrl`+digit accelerators cannot
disagree — with the active one, the active
dashboard page and the rail's width kept across restarts in `workspace-store.ts`, and one page
chrome (`PageShell`) so the six read as one application. Dashboard and Modules have pages of their
own — `Canvas`, `Templates`, `Fonts`, `Images`, because all four answer what the dashboard is made
of; and `LEDs`, `Matrix`, because a strip and a panel are separate devices authored nothing alike.
Each remembers its page across restarts (`dashboardView`, `modulesView` in `workspace-store.ts`).

A strip and a matrix are **separate `hardware` entries on separate pins**, not segments of a shared
chain (ADR 0030), so each Modules page lists only its own device kind and everything below it — the
pin, the shape, the layers, the preview — belongs to the one device selected there. Lamp numbering
is per device and starts at zero, which is what lets a page show one device without knowing what
else the board drives.
What the window owns rather than a page — live apply, `Cmd`/`Ctrl`+`S`, the
unresolved-fonts dialog — is mounted in `App.tsx`, so leaving a page never stops it.

The draft is one aggregate `DeviceConfiguration`, sliced into the three device documents only at the
edges — `shared/configuration-documents.ts` holds `documentOf` / `mergeDocument` /
`documentsDiffering`, and the protocol, the save orchestrator, live apply and the Configs page are
the only things that see three. Everything else keeps working on the whole draft.

The editor mutates one sparse draft document; canvas drag/resize, the inspector, and the advanced
JSON editor all write the same document — there is no separate editor-only layout model. The draft
owns its board identity, so it works fully disconnected; device connection and draft have independent
lifetimes ("Load config from board" is the explicit discard). **Modules is authored the same way**:
its empty state offers the same board choice and the same `createConfiguration` / `openConfigurationFile`
the empty canvas does, and the same `BoardPicker` sits in its header, because peripherals live in that
one draft rather than in anything the board has to be present for. A board that publishes no free LED
pins says so on the page instead of silently hiding the button that would add an output.

`layout-transfer.ts` carries the peripherals too: an output whose pin the target board does not offer
is moved to one it does, or loses its pin and says so, and a target with no display drops the dashboard
rather than scaling it against a zero-sized one. Both land in the same transfer report as the image and
clamping notes.

A dashboard moves to another board through `shared/layout-transfer.ts`: every pixel-valued property
scaled, either `contain` (one factor, centred, keeps proportions) or `stretch` (a factor per axis,
fills the display) as the author picks, plus a report of what did not carry (image bitmaps above
all, which the device never rescales). Every entry point goes through `convertDraftToBoard` in
`configuration-actions.ts` — the Configs page's "Convert draft to <board>", the canvas board picker,
and applying a template authored elsewhere — and the fit is one persisted preference in
`panel-store.ts` rather than three copies of local state.

The template library holds two kinds, in two folders: dashboards (a whole document) and widgets (one
widget, in `templates/widgets/`, so the two cannot collide on a name). Both kinds share one `TemplateCard`; a dashboard's `Add`
appends screens through `insert-screen.ts` and only `Use` replaces the draft. A widget entry carries
the fragment in its *summary* rather than being read per row, because the row draws it and `Add` hands
the same bytes to the canvas; a dashboard's document is still read on demand and cached in
`templates-store`, because a card draws it too and four configurations in one listing would be four
copies for nothing. Placing one is a mode on the canvas — `pendingInsert` in the editor
store, a ghost following the pointer, `insert-template.ts` scaling it only when it would not
otherwise fit — and it is the only thing that re-ids a whole subtree (`freshWidgetIds`), because two
widgets claiming one id would break the layer list, the selection and `goto_screen` at once. Which board is being authored for while
nothing is plugged in lives in the device store (`offlineBoard`), because the canvas and the Configs
page both offer that choice. A template is its payload inside an envelope, because the
configuration itself may hold no property the contract does not declare — and a widget fragment is
validated inside the smallest document that can carry it, the same trick the editor's clipboard uses
on a paste. See
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
four dashboard pages and the toolbar over them), `ConfigsPage.tsx` (files, the three documents on the
board with a Load/Save/Reset each, the saved-configuration library, the per-document
draft-versus-board diff and the raw JSON in one tab per document), `configuration-actions.ts` (every
command that replaces the whole document, plus the per-document load and reset, as plain functions so
a keystroke can reach one without a panel being mounted), `LayersPanel.tsx`, and the
`dashboard-editor.ts` barrel. The canvas shell, the
inspector shell and the keyboard commands live in `preview/`, `inspector/` and `editor/` with the
rest of their halves.

Board state that several pages read is a hook or a store rather than one page's local state:
`features/device/draft-state.ts` answers whether the draft parses, **which documents** differ from
what the board stores and from what it shows, whether it could be saved, and what holds live apply
back — one memoized answer, because comparing documents canonicalizes each one and four components
ask per frame during a drag; `save-to-board-store.ts` holds a save that outlives the button that
started it — and the remount a restart causes; `live-apply-store.ts` holds what the board is
currently being told; `board-sync-store.ts` holds the one question a divergence raises and gates
live apply until it is answered. `document-status.tsx` is the chip a page puts in its header to say
where its own document stands. The store keeps what the board **stores** (`activeConfiguration`)
apart from what it **shows** (`runningConfiguration`), which a live `@SC:APPLY` moves and a save
moves both of; the main process asks `@SC:INFO` every five seconds while the link is idle, so a
document written from elsewhere is noticed rather than silently overwritten.

## Conventions

- C++20, `.clang-format` is Google style, 100 columns, left pointer alignment, case-sensitive include
  sorting. 2-space indent everywhere (4 in `CMakeLists.txt`), LF, final newline.
- **File size**: keep source files at roughly 300 lines or fewer. A change that pushes a file past
  that splits it along a natural seam in the same change — never "later". Generated outputs
  (`*_generated.*`, the generated `.ts` mirrors, `google-fonts-catalog.json`) are exempt.
- **No comments**: source files carry no `//`, `/* */`, `/** */`, JSX or `#` comments, and the
  generators emit none either. What stays: the `Generated by ... Do not edit.` banner, compiler and
  linter directives (`// NOLINT(...)`, `// eslint-disable-next-line`), the `# CONFIG_X is not set`
  lines in `sdkconfig.defaults*`, which are kconfiglib directives rather than comments, and the
  SPDX header on vendored code (`drivers/guition_jc1060p470c/src/panel.c`), which is attribution.
- **Documentation is minimal**: add to `docs/` only what the code cannot say, and only when it is
  really needed — a line in an existing document over a new section.
- Prefer static allocation, `constexpr`, bounded fixed-size structures; avoid global mutable state,
  heap churn in periodic paths, and blocking work outside dedicated FreeRTOS tasks.
- No central application scheduler: FreeRTOS tasks for blocking work, LVGL timers for rendering,
  event bus callbacks for short module updates.
- The example sparse configurations live in `configurator/src/main/templates/bundled/`,
  wrapped in the template envelope and inlined into the main bundle. They are starting
  points offered by the template library, not inheritance profiles.
