# CLAUDE.md

@AGENTS.md

Guidance for Claude Code in this repository. AGENTS.md above is the working agreement. The rules
under `.claude/rules/` load when a matching file is read, and can be read directly while planning:

| Rule | Loads for | Holds |
| --- | --- | --- |
| `.claude/rules/firmware.md` | `firmware/**` | layering constraints, `EXTRA_COMPONENT_DIRS`, startup consequences, boards, the vendored patch stack |
| `.claude/rules/configurator.md` | `configurator/**` | the three-way split, the IPC rule, draft and stores, save to board, workspaces, templates, pnpm traps |
| `.claude/rules/dashboard-editor.md` | `configurator/src/renderer/src/features/configuration/**` | the editor's five directories and what stays out of the document |
| `.claude/rules/codegen.md` | generator sources and outputs | the five generators, their inputs and outputs |
| `.claude/rules/docs.md` | `docs/**`, root markdown | which document owns what, the anchors and ADR numbers to keep |

Three cooperating pieces: **firmware** on the ESP32 device, a desktop **configurator** that authors
and uploads configuration over serial, and **SimHub** on the PC feeding telemetry over the same link.
The architecture is [docs/architecture.md](docs/architecture.md); the configuration contract is
[docs/device-configuration.md](docs/device-configuration.md),
[docs/dashboard-widgets.md](docs/dashboard-widgets.md) and
[docs/control-protocol.md](docs/control-protocol.md) — read them before touching config code on
either side; decisions are in [docs/adr/](docs/adr). Links are not followed automatically: read the
file.

## Firmware builds (ESP-IDF, C++20)

Source the environment with `source tools/idf-env.sh firmware/build-x` from the root or
`cd firmware && source ../tools/idf-env.sh build-x`: the argument is a **path from the current
directory**, and a bare name from the root returns 1 and prints both forms. The script takes the
Python virtualenv that build directory was configured with, because a mismatched interpreter makes
`idf.py` refuse to build and suggest `fullclean`, which throws the build away. Plain
`source <idf-path>/export.sh` is enough for a build directory that does not exist yet.

Run from `firmware/`. Each board is a build directory plus a generated sdkconfig; always pass both
`-DSDKCONFIG` and `-DSDKCONFIG_DEFAULTS` so board defaults are not lost. ESP-IDF applies
`sdkconfig.defaults.<IDF_TARGET>` on its own.

```bash
cd firmware && idf.py -B build-t-display -DIDF_TARGET=esp32s3 -DSDKCONFIG=sdkconfig.generated.t-display -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.t-display-s3" build
cd firmware && idf.py -B build-guition -DIDF_TARGET=esp32s3 -DSDKCONFIG=sdkconfig.generated.guition -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.guition-esp32-4848s040" build
cd firmware && idf.py -B build-jc1060p470c -DIDF_TARGET=esp32p4 -DSDKCONFIG=sdkconfig.generated.jc1060p470c -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.guition-jc1060p470c" build
cd firmware && idf.py -B build-devkit -DIDF_TARGET=esp32s3 -DSDKCONFIG=sdkconfig.generated.devkit -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.esp32s3-devkit" build
```

Fragments appended to `SDKCONFIG_DEFAULTS` select what a build trades; the figures are in
[docs/runtime-performance.md](docs/runtime-performance.md), ADR 0027 and ADR 0032:

| Fragment | Selects | What it changes |
| --- | --- | --- |
| `sdkconfig.defaults.debug` | `CONFIG_PITRIG_DEBUG` | observation only — `@PR:DIAG` and the overlay — never product behaviour (ADR 0028) |
| `sdkconfig.defaults.render-partial` | `PITRIG_DISPLAY_RENDER_PARTIAL`, P4 | the fastest mode, accepting the seam; `CONFIG_PITRIG_DISPLAY_RENDER_FULL_STRIPS`, the tear-free strip mode, is the default |
| `sdkconfig.defaults.render-full` | `PITRIG_DISPLAY_RENDER_FULL`, P4 | the whole frame into PSRAM, with the 512 KB L2 cache |
| `sdkconfig.defaults.color-24bit` | `CONFIG_PITRIG_DISPLAY_COLOR_24BIT`, P4 | RGB888 end to end; the render strips move to external RAM |
| `sdkconfig.defaults.vsync-lock` | `CONFIG_PITRIG_DISPLAY_VSYNC_LOCK`, P4 | frames scheduled from the telemetry burst (ADR 0032); off by default |
| `sdkconfig.defaults.uncapped` | `CONFIG_PITRIG_DISPLAY_UNCAPPED`, P4 | no pacing hold; a measurement option, not a shipping one |
| `sdkconfig.defaults.jit` | `CONFIG_PITRIG_DISPLAY_JIT`, P4 | the experiment vsync-lock superseded, kept for comparison |

Flash and monitor use the same `-B` build directory: `idf.py -B build-t-display -p <port> flash monitor`.
Switching boards switches `IDF_TARGET`; `esp32p4` uses `dependencies.lock.esp32p4`. A clean checkout
runs `reconfigure` **twice** before `build`, because the vendored `esp_lvgl_port` is patched during
configure, after ESP-IDF has collected requirements. The DevKitC-1 has no display and only its
status lamp.

`configurator/package.json` versions the desktop application and names the release tag;
`firmware/version.txt` is the board's own, read into `PROJECT_VER` and reported by `@PR:INFO` and
the OTA status.

**CI** ([.github/workflows/build.yml](.github/workflows/build.yml)) runs on a push to `release` and
on demand: `checks` (the five generators with `--check`, `check_debug_isolation.py --check`, the
configurator's typecheck and lint), `configurator` (electron-builder on macOS, Windows and Linux),
`firmware` (four boards in `espressif/idf:v6.0.2`), then a **draft** release with the installers and
four OTA images. Packages are checked for debug traces and for the telemetry bridge, which only
development builds carry (an `app.asar` grep, ADR 0034); nothing is signed, so macOS needs
`xattr -dr com.apple.quarantine`.

**VS Code** ([.vscode/tasks.json](.vscode/tasks.json)) carries twelve `Pitrig: Build …` tasks,
`Pitrig: Build All Firmware` (sequential, esp32s3 first), `Pitrig: Flash` / `Monitor` /
`Flash and Monitor` over a picked build directory, `Pitrig: Check Generated Contracts` and
`Regenerate Contracts`, and `Configurator: …` / `Debugger: …` for both Electron applications; there
is deliberately no default build task. The port is chosen, not
typed: `tools/pick-serial-port.py` lists the ports present, stars the flashable one, offers `auto`,
and `PITRIG_PORT` overrides the prompt.

## Configurator (Electron + React 19 + TypeScript, pnpm)

```bash
cd configurator && pnpm install && pnpm run dev
cd configurator && pnpm run dev:debug
cd configurator && pnpm run typecheck
cd configurator && pnpm run lint
cd configurator && pnpm run build
cd configurator && pnpm run package
```

`dev:debug` starts the second application from the same package (serial console, telemetry bench,
`@PR:DIAG` charts); `typecheck` covers three projects; `build:debug` and `package:debug` do the same
for the debugger into `out-debug/` and `dist-debug/`. There is no test runner. `electron` must stay
in `allowBuilds` in `pnpm-workspace.yaml`, or `pnpm run dev` fails with `Error: Electron uninstall`.

## Checks and generated contracts

```bash
python3 tools/check_debug_isolation.py --check
```

Records the `#if PITRIG_DEBUG` hooks production firmware carries and fails when the set changes;
run it without `--check` to accept a deliberate change (ADR 0028).

Five generators own checked-in code, each run with `python3 -m` **from the repository root** and
each accepting `--check`; never hand-edit an output:

```bash
python3 -m tools.codegen.configuration_schema
python3 -m tools.codegen.telemetry_catalog
python3 -m tools.codegen.led_font
python3 -m tools.codegen.font_catalog
python3 -m tools.codegen.ui_strings
```

| Generator | Sources | Outputs |
| --- | --- | --- |
| `configuration_schema` | `configuration/configuration_schema.json` | the firmware contract and validator headers, `configurator/src/shared/configuration-schema.ts`, `docs/configuration-schema.md` |
| `telemetry_catalog` | `telemetry/telemetry_catalog.json`, `telemetry/simhub_generic_mappings.json` | the firmware catalog headers, `configurator/src/shared/telemetry-catalog.ts` and `simhub-profile-data.ts`, `docs/telemetry-catalog.md`, `simhub/Pitrig-telemetry.shsds`, `simhub/plugin/Pitrig.SimHub/TelemetryCatalog.g.cs` |
| `led_font` | `fonts/led_bitmap_font.json` | `firmware/components/led/include/led_font_generated.hpp`, `configurator/src/shared/led-font.ts` |
| `font_catalog` | `fonts/google_fonts_snapshot.json`, `fonts/google_fonts_selection.json` (`--refresh` re-fetches) | `configurator/src/main/font-library/google-fonts-catalog.json` |
| `ui_strings` | `i18n/en.json` | `configurator/src/shared/ui-string-keys.ts` and `ui-strings-en.ts`, read through `t()` in `ui-text.ts` (ADR 0031) |

## Configuration is three documents

`dashboard`, `modules` and `protocol` are transferred, stored, validated and applied on their own:
`@PR:GET:<doc>` and `@PR:SET:<doc>:<json>`, one NVS record and payload bound each (128 KB / 32 KB /
1 KB), `reboot_required` only for `protocol`, and `APPLY` rebuilding the running composition without
writing storage (ADR 0024). The contract lives in the `configuration_contract` service component and
mirrors into `configurator/src/shared/`; the `documents` block of the schema must partition every
serialized root section.

## Conventions

AGENTS.md holds the rules: about 300 lines a file, no comments, minimal documentation. Firmware is
C++20 with `.clang-format` Google style, 100 columns, left pointer alignment and case-sensitive
include sorting; 2-space indent everywhere (4 in `CMakeLists.txt`), LF, final newline. The example
configurations in `configurator/src/main/templates/bundled/` are starting points, not inheritance
profiles.
