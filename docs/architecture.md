# SimCore Architecture

## Overview

SimCore is a modular firmware platform for building sim racing hardware using ESP32.

The architecture is designed around a small, hardware-independent firmware core, reusable components and modules, and interchangeable hardware drivers.

The primary goal is long-term maintainability, modularity, and extensibility. Every architectural decision should make the platform easier to extend without modifying existing components.

---

# Core Principles

The firmware is built around several strict principles.

## Modularity

The system is composed of independent layers with explicit responsibilities.

Components expose hardware capabilities.

Modules implement user-visible functionality.

Services provide shared infrastructure.

Drivers implement access to specific hardware.

Adding or removing an implementation should not require changes to unrelated layers.

---

## Separation of Responsibilities

Feature logic and hardware logic are always separated.

Modules implement functionality.

Components expose reusable hardware capabilities.

Drivers implement hardware access.

The firmware core coordinates everything.

---

## Hardware Independence

The firmware core must never depend on specific hardware.

Displays, LEDs, buttons, encoders, touch panels and future peripherals are accessed through components and their interfaces. A board declares which of them it has, and which GPIOs it leaves free for the ones it does not.

Replacing hardware should primarily require implementing a new driver instead of modifying application logic.

---

## Configuration Driven

The platform should be configured instead of hardcoded whenever practical.

Configuration determines:

- enabled modules
- communication settings
- supported configurable hardware devices and driver settings
- layouts

Immutable board identity determines hardware physically built into the board
and its fixed capabilities. User configuration must match that identity but
cannot change it. Additional supported hardware remains configuration-driven;
its device list may be empty.

The firmware should avoid device-specific code paths.

---

# High-Level Architecture

```
                    +-------------------------+
                    |     SimHub / PC App     |
                    +------------+------------+
                                 |
                       Communication Layer
                                 |
+----------------------------------------------------------------+
|                         Firmware Core                          |
|----------------------------------------------------------------|
| Startup                                                        |
| Configuration                                                  |
| Scheduling Ownership                                           |
| Event System                                                   |
| Static Service Composition                                     |
| Bounded Module Manager                                         |
+----------------------------------------------------------------+
              |                    |                     |
              |                    |                     |
       +------+-----+       +------+-----+       +-------+-----+
       |  Modules   +------>| Components |       |  Services   |
       +------------+       +------+-----+       +-------------+
                                   |
                              Interfaces
                                   |
                    +--------------+--------------+
                    |                             |
               Display Drivers               Input Drivers
                    |                             |
              T-Display-S3...                  GT911 touch
```

---

# Firmware Layout

The firmware source is organized by architectural responsibility.

```text
firmware/
├── core/          Firmware startup, orchestration and module lifecycle
├── components/    Reusable hardware capabilities
├── interfaces/    Contracts implemented by drivers
├── drivers/       Hardware-specific implementations
├── modules/       User-visible functionality
├── services/      Shared infrastructure
├── platform/      Platform-specific support
├── utils/         Generic utilities
├── main/          ESP-IDF application entry point
├── cmake/         Build helpers that apply the pinned vendor patches
└── patches/       Version-pinned patches to managed components
```

Each implementation is registered as an ESP-IDF component when it needs independent dependencies or public include paths.

Public headers are stored directly under an implementation's `include/` directory. Implementation files are stored under `src/`.

The dependency direction is:

```text
main
  |
  v
core ----> core/module_manager
  |----> components
  |----> services
  `----> platform composition

platform composition ----> modules
platform composition ----> components
platform composition ----> services
board registry -----------> drivers
transport composition ----> transport drivers
modules ------------------> services and components
components ---------------> interfaces <--------------- drivers
components / drivers -----> services   (diagnostics instrumentation only)
services -----------------> interfaces (transport-facing control services)
```

Dependencies must not point from interfaces or components to a concrete hardware driver.

The last two edges are narrow and deliberate. The display component and the
transport drivers depend on the performance service so they can report frame and
transport instrumentation; that service lives in `firmware/debug/` and registers
with no sources and no include directories unless `CONFIG_SIMCORE_DEBUG`, so the
dependency compiles away entirely (ADR 0028). The control services that answer over the serial
link — configuration control, the shared asset upload engine, and the font and
image asset controls over it — depend on the `transport` interface because they
answer over it; they depend on no concrete driver. The debug-only performance
overlay reads transport counters and so gives the dashboard the same interface
edge.

Logging follows the layer boundary: drivers log through ESP-IDF's `ESP_LOGx`
directly, and everything above the driver layer goes through the logger service
(ADR 0001), whose backend is selected at compile time.

---

# Firmware Core

The firmware core is the static application composition root. It owns
firmware-lifetime platform adapters and services and coordinates startup
through explicit references. Concrete display and telemetry transport
selection stays in platform composition. SimCore does not use a runtime
Service Registry or service locator.

What the core owns by value stops at types it can see without LVGL. The
dashboard is the exception it makes: `dashboard_composition` declares
`Dashboard` and keeps its storage — the widget pools, the LVGL object arrays,
the controllers over them — in an internal header. The core holds no member for
it and takes it from `dashboard_composition::instance()`. It is statically
allocated exactly as everything else the root owns; it simply lives in the
component that knows its type, so the core neither links against LVGL nor
recompiles when a widget type changes. It is also the one static the firmware
places in external RAM: some 68 KB of widget-state pools whose per-frame
working set is a few kilobytes, kept out of the internal RAM the draw buffers
need. Only the render trigger's task stack and control
block, which FreeRTOS requires internal, sit beside it in internal `.bss`.

The LVGL heap is there too — every object, style, font cache and label string
LVGL allocates comes from external RAM
([ADR 0026](adr/0026-ui-memory-in-external-ram.md)) — so free internal RAM does
not move with what is composed, and how many widgets and font sizes a dashboard
may hold is a question about frame time rather than about memory.

Responsibilities include:

- startup
- initialization
- configuration loading
- bounded module lifecycle
- scheduling ownership
- communication
- shared services
- event dispatching

The firmware core must not contain feature-specific logic.

## Startup order

The phases run in the order below, and the order is the decision rather than an
accident of how the file grew ([ADR
0025](adr/0025-startup-order-and-safe-mode.md)):

```text
boot guard → configuration → link + control protocol → display → assets →
modules + dashboard → composed → complete
```

The serial link comes up **before** the display and before anything is composed.
Everything a board can be repaired with therefore sits ahead of everything a
board can be broken by: a configuration that will not compose, a font package
that will not map, a panel that stops answering, a widget that dereferences
null. The configuration stays ahead of the link only because the `protocol`
document chooses the port, the pins and the baud rate, and reading it is a
handful of NVS reads and no hardware.

Starting the link waits for no host; it installs a driver and creates a read
task, and a board with nothing plugged into it passes the phase in milliseconds.

A crashed task on this chip is a panic that resets the whole device — FreeRTOS
has no memory protection between tasks, so a fault cannot be isolated where it
happens. It is contained on the boot *after* it instead. The `boot_guard`
service counts crashes and watchdog resets in RTC memory, which survives the
reset the crash caused; three in a row and the next boot runs the **recovery
surface**: the transport, the `@SC:` control protocol and firmware upload, and
nothing else. The count is cleared by the first document a host writes or
erases, so both an ordinary save and a factory reset are ways out.

The task watchdog resets rather than prints. It watches only the tasks that feed
it: each link's read task, and the render trigger, which takes the LVGL lock
every round and so fails to feed when the LVGL task stops giving it back.

The bounded Module Manager stores compile-time descriptors with function
pointers and explicit contexts. A dedicated module composition registers the
available module implementations and configuration controls which descriptors
are enabled. A separate dashboard composition owns LVGL views and binds them to
module and telemetry readers. The manager performs no allocation or name-based
lookup.

---

# Components

Components expose reusable hardware capabilities to the core and modules.

Three exist:

- Display
- Touch Input
- LED

Buttons and encoders are still owed. The LED component owns the lamp buffer, the
colour order each chip family reads, the gamma table, the brightness scaling and
the current clamp, the mapping from a matrix cell to its place in the chain, and
the four compiled bitmap faces a matrix draws text with. It knows nothing of the
configuration contract, so the module translates
([ADR 0030](adr/0030-addressable-led-peripherals.md)). The input
component registers the board's pointer with the LVGL port and nothing else —
the board descriptor carries its input driver as a nullable pointer, so a board
with no digitizer is a board fact rather than a special case in the core, and a
digitizer that fails to answer is logged and survived rather than fatal
([ADR 0019](adr/0019-input-interface-and-touch.md)).

Components own capability-level behavior but do not access board-specific hardware directly.

Components depend on interfaces rather than concrete drivers.

---

# Modules

Modules provide user-visible functionality. Two exist. `lap_timer` owns
lap-time extrapolation, correction and stale-telemetry handling behind a
value-pipeline callback. `rgb_leds` owns the addressable LED outputs: it turns
the `hardware` section into chains, binds each layer's telemetry once, and
repaints every output on its own task at sixty frames a second, because the
event-bus handler runs on the transport read task and blocking it would stall
telemetry for the dashboard too.

Modules communicate through platform services rather than directly with each other whenever possible.

Modules use components and never access hardware directly.

---

# Platform

Platform code adapts modules and components to framework-specific presentation and runtime facilities.

Dashboard widgets are platform-specific UI. Reusable widgets receive a pre-bound typed value
pipeline from a startup-only widget binder and own only bounded transform
configuration and LVGL presentation state.

The dashboard composes up to four screens, whose shape widgets may hold widgets
of their own: a container is one LVGL object, so the widgets inside it are placed
relative to its box — and drawn even where they overhang it, which costs an
explicit overflow flag and a measured extra draw size. A slot widget is an area
that switches what it shows: it draws nothing, holds pages of widgets sharing its
box, and shows one of them — cycled by a tap, or raised over that loop for a
bounded time by a telemetry trigger
([ADR 0021](adr/0021-widget-groups-and-slots.md)). Screen loading, the swipe, and
the tap targets that navigate all live in one navigation controller
([ADR 0020](adr/0020-screen-navigation.md)); widgets are built refusing input and
the composition makes only the authored tap targets clickable, so no widget type
knows about input. The dashboard uses no LVGL theme: every object it creates
sets what it draws explicitly, so the build selects no theme and compiles only
the five LVGL classes the widgets are made of (`lv_obj`, `lv_label`,
`lv_image`, `lv_line`, `lv_arc`). Stateful modifiers, including Lap
Timer, are implemented by modules and hidden behind the pipeline callback. Pure
transforms live under `utils/transformers` and do not depend on dashboard or LVGL.
Widgets do not know protocol identifiers or telemetry field names and do not
own telemetry processing, extrapolation, or correction logic.

Platform code may depend on modules and components. Modules must not depend on platform code or UI frameworks.

Neither side simulates telemetry. The configurator receives none — the control protocol carries no command for reading values and SimHub owns the port while a session runs — so its preview draws every source as unavailable and shows the placeholders the device itself draws. The firmware carries no development-only telemetry source either, and any that is ever added must stay isolated under `platform/` so production communication can replace it without changing module APIs.

---

# Services

Services provide shared infrastructure used by the core, components, modules, and drivers when appropriate.

They are:

- Logging (the performance collector is a debug component under `firmware/debug/`)
- The configuration contract, the configuration service over it, and the
  transport-facing configuration control
- Telemetry — registry, state and the SimHub protocol under it
- The event bus
- Font and image asset catalogs and package validation, and the leaf font and
  image contracts beside them
- Uploaded asset storage, the shared package header, the shared `SCF1` upload
  engine and the binary session claim over it, plus the font, image and
  firmware kinds on that engine

The `configuration_contract` service component owns the bounded
application value contract. The configuration service parses, validates, and
persists that contract. Module and dashboard implementations depend only on the
contract component, which contains no storage, control protocol, module
implementation, ESP-IDF build configuration, or LVGL widget headers. Shared
font value types live in the leaf `font_contract` component.

Services must remain focused and must not contain hardware-specific application logic.

The font asset service owns the bounded, platform-independent single-package
lifecycle. Its ESP partition adapter lives under `platform/`, while dashboard
code owns the LVGL-specific runtime font registry. This keeps raw flash access
and UI-framework integration out of the service. See
[Font asset storage](font-assets.md) for the persisted format and update rules.
The separate font asset control service owns the bounded serial upload session
and delegates erase, write, validation, and commit operations to the asset
service from a static worker task. The configuration router only switches the
shared transport between normal line routing and the active binary session.

Uploaded images follow the same shape with a different package format: an image
asset service over its own partition and dashboard code owning the LVGL image
descriptors. The two kinds share the `asset_storage` contract, the
`platform/partition_asset_storage` adapter, and one `binary_session` claim: each
kind registers a command prefix and two callbacks, so the router never branches
on what a font or an image is, and a second concurrent upload is refused instead
of raced.

They also share the upload engine itself. A package arrives the same way
whatever it contains — the same `SCF1` framing, the same stop-and-wait sequence
and CRC, the same inactivity timeout, the same worker task and claim — so that
state machine lives once in `services/asset_control`. A kind supplies only its
protocol tag (`FONT`, `IMAGE`, `FW`), its task identity, and two things the
engine cannot know: how to drive its service, and what its `INFO` reply says
about an installed package. Those arrive as plain data — a `Traits` value and an
`Operations` table of function pointers — rather than as a template, so the
binary carries one copy of the machine and `font_asset_control` and
`image_asset_control` are ~90 lines each.

Firmware is the third kind on that engine. `services/firmware_update` receives
an uploaded application image into the inactive OTA slot, streaming it through
`esp_ota_write` rather than through `asset_storage` — nothing maps a firmware
image, so the storage contract under the other two has nothing to offer it. It
is also one component rather than a service and a wrapper over it: fonts and
images split that way because the dashboard reads faces and bitmaps, and nothing
reads a firmware image at runtime. See
[Firmware updates over serial](ota.md) and
[ADR 0022](adr/0022-over-the-air-firmware-updates.md).

The package format under that engine is shared the same way. Both kinds write
the same 32-byte header and commit it identically — payload first, header last,
read back what was stored, reboot before the new package is used — so
`services/asset_package` owns that header, its validation and the update status
and error types. Each kind keeps only what genuinely differs: its magic and
version, its manifest entry decoder, and its catalog. A font face describes
itself and a bitmap does not, which is why an image entry carries geometry and a
font entry does not. Images are
converted by the configurator to the layout and size the display draws; the
device holds no decoder. See [Image asset storage](image-assets.md) and
[ADR 0018](adr/0018-uploaded-image-assets.md).

The desktop configurator edits dashboard widgets directly in the logical
display coordinate space. Canvas selection, dragging, resizing, property
inspection, and the advanced JSON editor all mutate the same sparse
local draft; there is no second editor-only layout model to reconcile. Which
screen is being edited, which slot is open, and which of its pages is being
looked at, are editor state rather than document properties — the device always
starts at the first screen and picks a slot's page for itself. The
draft owns its target board identity and therefore resolves the immutable local
board profile and display geometry even while no device is connected. Device
connection state and the local authoring draft have independent lifetimes.

---

# Drivers

Drivers implement hardware-specific functionality.

Board-specific display continuity measures stay out of the generic display
interface. The Guition JC1060P470C driver blanks its backlight from an ESP-IDF
shutdown handler before a software reset. Keeping the ESP32-P4 MIPI-DSI display
interrupts cache-safe during flash writes is a build measure rather than driver
code: `CONFIG_LCD_DSI_ISR_CACHE_SAFE` in the P4 defaults, plus the first of the
version-pinned `esp_lvgl_port` patches under `firmware/patches/` — a stack of
nine, one concern each, that `firmware/cmake/` applies in order — so the port's
flush callback honours it. Two further pinned patches fix
LVGL 9.5.0's experimental PPA backend: it passes the draw buffer's unaligned
`data_size` to `esp_cache_msync()`, which breaks the cache-line contract, and it
synchronizes the whole buffer per operation rather than the rows it touched —
multiple megabytes twice over when LVGL renders straight into a full-screen
frame buffer. The board's own defaults keep its High-Speed USB port in
slave/IRQ mode rather than DMA: ESP32-P4 rev 1.x can hand the TinyUSB DWC2
driver an invalid EP0 setup-packet DMA address, and enumeration fails.

What exists:

- Display drivers, one per board (T-Display-S3, Guition ESP32-4848S040,
  Guition JC1060P470C)
- One touch driver, the GT911
- Transport drivers: UART and USB CDC, over a shared `transport_common`. The
  USB CDC driver owns the whole native USB device, which on a board that has
  one enumerates as a composite CDC serial port plus an HID gamepad

Drivers implement interfaces used by components.

Drivers should not contain application logic.

---

# Interfaces

Interfaces define contracts between components and drivers.

Components depend on interfaces rather than concrete implementations.

Every hardware implementation should satisfy the same interface.

Interfaces should remain small and must not contain board-specific pin assignments or device logic.

---

# Communication

Communication with external software is handled through a dedicated platform
communication composition.

The communication protocol should be isolated from business logic.

Changing the transport should not require rewriting modules.

The communication composition owns the configuration control endpoint, the
font and image asset control endpoints and the binary-session claim they share,
the line/binary router, and the concrete telemetry protocol. A dedicated
platform composition owns and configures the concrete transport adapters
supported by the selected board. The core receives only `ITransport` and uses
no UART, USB CDC, ESP-IDF UART type, SimHub identifier, or protocol class; it
owns the transport composition by value, so its translation units compile
against those adapters' headers without naming anything in them.

Possible transports include:

- USB Serial
- WebSocket
- BLE
- Wi-Fi
- Future protocols

Each link's router owns line assembly for both line-oriented concerns: it
splits the byte stream once, hands `@SC:` lines to configuration control and
every other complete line — terminator stripped, bounded at
`telemetry::kMaximumTelemetryLineLength` — to the telemetry protocol, which
decodes it and holds no partial line of its own.

Telemetry ingestion is split into an immutable registry and mutable state. The
registry defines protocol-neutral field names and types. Protocols bind source
identifiers to registry handles once during startup. The state stores current
typed values in fixed slots indexed by those handles. Modules and widgets read
only pre-bound handles; periodic paths perform no name lookup.

---

# Device Configuration

The desktop configurator is the primary authoring and device-management tool.
Project JSON and the public device payload are sparse: omitted components stay
absent instead of being expanded through board profiles.

Its window is a rail of workspaces — Dashboard, Modules, Protocol, Configs,
Firmware, Info — over one page at a time, with the serial connection
above all of them. Dashboard carries the canvas and the three libraries it draws
from; Configs carries everything that replaces the whole document and lists the
three configuration documents on the board; Modules is the reserved place for
peripherals, which have no production contract yet. Dashboard, Modules and
Protocol each own one of the three documents, which is why each can say on its
own whether its settings are saved. See
[Authoring in the configurator](device-configuration.md#authoring-in-the-configurator).

Debug tooling is a second Electron application built from the same package
(`pnpm dev:debug`), holding the serial console, the telemetry bench and the
`@SC:DIAG` charts, plus firmware upload and raw document editing of its own so a
debugging session needs nothing else running — one serial port admits one
process. It composes the same services and IPC handlers as the product; the
dependency runs one way, and the product bundle carries no debug code
(ADR 0028).

Firmware builds own one immutable `BoardDefinition`. It binds the board
identifier, display driver, default telemetry transport, factory payload, and
private validation metadata for constraints such as logical display bounds and
the board's UART pin pair. The display driver and the input driver are both
nullable: a board without a panel, or without a digitizer, is a board fact
rather than a special case, and the core reads absence in one place instead of
carrying board identity. This metadata is not part of the public
configuration or device-information protocol.
Firmware reports only the stable board identifier; the configurator maps it to
a local supported board profile containing read-only authoring metadata such as
logical display dimensions. Every configuration document includes a matching
board identifier for compatibility validation. A separate optional bounded list
controls supported configurable hardware devices and may be empty; it is what
the `modules` document carries.

The factory user configuration is three compiled documents, each containing
that board identifier and, on a board whose link needs it, the transport
settings it cannot come up without. Hardware
declared as built into the board remains enabled; currently, a board-provided
display is initialized by default and exposed to the configurator as a
read-only capability. A board that declares none starts no LVGL and composes no
dashboard, and keeps its configuration link, transport and modules unchanged. Additional hardware devices, modules, and widgets are
created only when present in the validated configuration, so a freshly flashed
or reset production device has an enabled display with an empty dashboard.

The public configuration schema uses bounded sparse JSON directly for authoring
and device transport. It is transferred and stored as three documents —
`dashboard`, `modules` and `protocol` — each carrying the board identifier and
its own sections, each with its own NVS record, generation, payload bound and
answer to whether a restart is owed
([ADR 0024](adr/0024-separate-configuration-documents.md)). In memory they are
one bounded structure, so a rule that spans sections stays one check; a
replacement parses over the sections its document owns and the whole result is
validated. Widget geometry uses absolute logical display coordinates; regions,
region identifiers, and anchors are not part of the contract. Firmware parses and
validates JSON on the configuration/startup path, then runtime code uses bounded
typed structures.

Fonts use a bounded family identifier and pixel size. Production firmware has
no built-in dashboard font families. Configurator-imported faces are uploaded
unchanged, one per family, into a separately versioned, checksummed flash
package; they are not embedded in configuration JSON, configuration NVS, or the
application image. Family resolution is exact, so a missing family is a
dashboard composition error rather than an implicit fallback, while any pixel
size is rasterized on the device. Dashboard code owns the runtime font registry:
it copies each face into external memory, creates one font per family and size
the active configuration references, and pre-warms their glyph caches during
composition so periodic frames do not rasterize. LVGL needs one built-in
default font to build at all, so every profile compiles the smallest one
(UNSCII 8); nothing in the dashboard uses it, it is not in the dashboard font
registry, and only the diagnostic overlay of a debug build draws with it.

Images follow the same rule from the configuration's point of view: a widget
references a bounded image identifier, an uploaded package supplies the pixels,
and a missing identifier is a composition error rather than a substitution.
Unlike a face, an image is stored in the exact layout and size it is drawn at,
so resizing a widget is a re-conversion in the configurator rather than a
runtime scale.

Persistent NVS record headers, per-document generations, CRC validation, and
recovery remain private to the configuration service. External tools communicate
only through the public configuration control protocol, which names the document
it is acting on.

---

# Event System

The firmware distributes information through an event-driven architecture whenever appropriate.

Examples:

- telemetry updates
- button presses
- encoder rotation
- page changes
- connection state

The event system reduces coupling between modules.

---

# Scheduling

SimCore runs on FreeRTOS, but it does not add a central application scheduler.
Each subsystem owns the mechanism appropriate to its work:

- FreeRTOS tasks for blocking or long-running service operations;
- LVGL timers for periodic rendering;
- Event Bus callbacks for short module updates.

A central scheduler requires a separate architectural decision if a future
cross-subsystem timing requirement cannot be represented by these mechanisms.

On the dual-core targets the two halves of the firmware are pinned apart:
communication — the transport read tasks, the configuration-control and
asset-upload tasks, and the render trigger they wake — runs on
`SIMCORE_COMMUNICATION_CORE`, and the LVGL task alone on `SIMCORE_RENDER_CORE`
(both in `simcore_features.hpp`). Parsing a telemetry chunk, validating a
128 KB document, or a live apply therefore never time-slices with a frame, and
because the render trigger has the lower priority on its core, a received chunk
is parsed to the end before the single pass it triggers.

Dashboard rendering combines the three so a telemetry change is not delayed by
a widget timer period. The dashboard composition subscribes to telemetry update
events; the handler signals a small render-trigger task, which takes the LVGL
lock, marks the widget render timers ready, releases the lock, and wakes the
LVGL task. The next LVGL pass therefore reads the changed values and refreshes
immediately. The periodic widget timers remain as the fallback and as the clock
for free-running module sources; the trigger adds no polling and makes no LVGL
call outside the LVGL lock, and the task that committed the telemetry never
waits on the UI.

While a refresh is already drawing, the handler skips the trigger. A driver
that waits for the display before reusing a frame buffer keeps the LVGL lock
for most of a display period, and both the refresh timer and the widget timers
are overdue when it returns, so the pass that follows reads the update without
being woken. Waking anyway would only place the trigger task in the lock queue
ahead of the next frame. The display component owns that state because it owns
the LVGL lifecycle; rendering pace stays a property of the display, not of the
telemetry rate.

Long-running work must execute in dedicated tasks.

Blocking operations should be avoided.

Time-critical operations should use DMA or hardware acceleration whenever available.

---

# Memory Management

Memory is a limited resource.

The platform should:

- minimize allocations
- avoid fragmentation
- reuse buffers
- prefer static allocation where practical

Large temporary allocations should be avoided.

---

# Rendering

Rendering should be independent from display hardware.

Rendering modules should use the display component rather than a concrete display driver.

Display drivers are responsible for transferring rendered data to hardware.

DMA should be preferred whenever supported.

---

# Extending SimCore

Adding a new feature should usually involve:

1. Creating a module.
2. Reusing existing components and services.
3. Adding a component only when a new hardware capability is required.
4. Reusing an existing interface.
5. Implementing a driver only when new hardware is introduced.

The firmware core should rarely require modification.

---

# Architectural Rules

The following rules should always be respected.

- The core must not know specific hardware.
- Modules must not access hardware directly.
- Components must not depend on concrete drivers.
- Drivers must not contain business logic.
- New hardware should primarily require new drivers.
- Configuration should replace hardcoded behavior whenever practical.
- Public interfaces should remain stable.
- Prefer composition over inheritance.
- Prefer explicit dependencies.
- Avoid global mutable state.
- Keep components small and focused.
- Avoid introducing new abstractions unless they solve a demonstrated problem.

---

# Future Evolution

The architecture is intentionally designed for future expansion.

Examples include:

- additional configurator editors and device operations
- plugin system
- scripting
- additional communication protocols
- new hardware families

Future capabilities should integrate into the existing architecture without requiring major redesign.
