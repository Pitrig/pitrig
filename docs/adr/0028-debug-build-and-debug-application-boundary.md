# ADR 0028: Debug Build and Debug Application Boundary

Status: Accepted. Amends
[ADR 0004](0004-performance-service-and-overlay-boundary.md): the service/overlay
boundary it drew is unchanged, but it now runs along the build as well — the
collector, the overlays and the `@PR:DIAG` responder live outside the product
tree entirely.

## Context

Debug tooling had grown into the product from both sides. In firmware the
implementation sat in `services/performance`, in two dashboard widgets and in a
`configuration_control` source file, gated by `#if PITRIG_DEBUG` but compiled
into the same components as the product. Four places leaked past the gate: the
public `asset_control.hpp` named `performance::TaskMetric` in a production
struct, `ITransport` carried a `Diagnostics` virtual, the dashboard held both
overlays as unconditional members, and every telemetry commit paid an
`esp_timer_get_time()` for a field only a debug probe read. In the configurator
~3 400 lines of bench and console code shipped inside the product bundle, with
the Debug workspace visible in a production build.

Worse, a debug build did not behave like the product. The LVGL task slept 8 ms
instead of 16, and `will_render_content()` returned `true` unconditionally. What
we measured was not what we shipped, so a finding in debug could not be trusted
against production.

## Decision

Two rules govern the boundary.

**Production carries nothing for debug.** No code, no struct fields, no virtual
methods, no cycles in a periodic path.

**A debug build is the product plus observation.** It never changes product
behaviour. If observation needs different behaviour, that is a defect in the
observation, not a licence to diverge.

### Firmware

Debug implementations live in `firmware/debug/` as four components —
`performance`, `diagnostics_command`, `overlays` and `instrumentation`. Each
registers with empty `SRCS` and empty `INCLUDE_DIRS` unless
`CONFIG_PITRIG_DEBUG`. Requirements stay unconditional because ESP-IDF resolves them in
an early expansion pass where the config is not yet known; the component turns
itself off instead. Empty include dirs are load-bearing: a production build
cannot compile an unguarded `#include "performance.hpp"`, so the leak that
started this cannot come back silently.

Production code keeps only one-line hooks behind `PITRIG_DEBUG`.
`tools/check_debug_isolation.py` records how many each production file carries
and fails when the set changes, so a new hook is visible in review.

`@PR:DIAG` is a hook rather than a debug-owned method: `configuration_control`
calls `debug::diagnostics::write()` into its own buffer, so production knows
nothing of `performance` or `heap_caps`, and the debug component knows nothing
of `ConfigurationControl`.

`PITRIG_DEBUG` and `PITRIG_LAYOUT_DEBUG` are normalized to `1`/`0` like their
neighbours. They previously expanded to an undefined identifier when off, which
worked in `#if` but made them unusable in a C++ expression — and would have
failed silently in a file that forgot the header.

### Configurator

`configurator/` builds two Electron applications from one package. `pnpm dev`
runs the product from `electron.vite.config.ts` into `out/`; `pnpm dev:debug`
runs the debugger from `electron.vite.debug.config.ts` into `out-debug/`.
Separate main process, preload, window and bundle; the product bundle contains
no debug code at all.

Dependency runs one way: `src/debug/**` may import anything, and `src/main`,
`src/preload`, `src/renderer` and `src/shared` may not import `src/debug`. An
ESLint `no-restricted-imports` rule holds it, mirroring the firmware script.

The debugger composes the same service graph through `createAppServices()` and
registers the product IPC handlers plus its own, so the serial stack, protocol
and upload engines are shared rather than forked. It writes its own Configs
screen instead of reusing the product's, which would pull the whole dashboard
editor in for no benefit.

`serialport` is native and one port admits one process, so the two applications
cannot both be connected. That is why the debugger carries firmware upload and
configuration documents of its own: a debugging session never needs the other
application running.

## Consequences

- The production T-Display image lost 176 bytes of flash and 1 840 bytes of
  internal `.bss`, and contains no Pitrig debug symbol.
- Debug builds now measure the product. Every frame-time and latency figure taken
  under the 8 ms sleep is superseded and must be re-measured, including the
  figures in [ADR 0026](0026-ui-memory-in-external-ram.md).
- A production build answers `@PR:DIAG` with `@PR:ERR:unsupported`. Diagnosing a
  board in the field means flashing a debug build over `@PR:FW:`.
- `services/performance` no longer exists as a service; `platform/dashboard` no
  longer builds the overlay widgets.
- Adding a debug hook to production code is a reviewable event rather than an
  invisible one.
