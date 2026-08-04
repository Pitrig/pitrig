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

Displays, LEDs, buttons, encoders, touch panels and future peripherals are accessed through components and their interfaces.

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
                                |
                      Communication Layer
                                |
+---------------------------------------------------------------+
|                        Firmware Core                          |
|---------------------------------------------------------------|
| Startup                                                   |
| Configuration                                             |
| Scheduler                                                 |
| Event System                                              |
| Service Registry                                          |
| Module Lifecycle                                          |
+---------------------------------------------------------------+
              |                    |                    |
              |                    |                    |
       +------+-----+       +------+-----+       +------+------+
       |   Modules   +------>| Components |       |  Services   |
       +------------+       +------+-----+       +-------------+
                                   |
                              Interfaces
                                   |
                    +--------------+--------------+
                    |                             |
               Display Drivers               Input Drivers
                    |                             |
              T-Display-S3...              Buttons, Encoder...
```

---

# Firmware Layout

The firmware source is organized by architectural responsibility.

```text
firmware/
├── core/          Firmware startup and orchestration
├── components/    Reusable hardware capabilities
├── interfaces/    Contracts implemented by drivers
├── drivers/       Hardware-specific implementations
├── modules/       User-visible functionality
├── services/      Shared infrastructure
├── platform/      Platform-specific support
├── utils/         Generic utilities
└── main/          ESP-IDF application entry point
```

Each implementation is registered as an ESP-IDF component when it needs independent dependencies or public include paths.

Public headers are stored directly under an implementation's `include/` directory. Implementation files are stored under `src/`.

The dependency direction is:

```text
main
  |
  v
core
  |----> modules
  |----> components
  |----> services
  `----> platform

modules ----> components
platform ----> modules
platform ----> components
components ----> interfaces <---- drivers
```

Dependencies must not point from interfaces or components to a concrete hardware driver.

---

# Firmware Core

The firmware core is responsible only for platform infrastructure.

Responsibilities include:

- startup
- initialization
- configuration loading
- module lifecycle
- scheduling
- communication
- shared services
- event dispatching

The firmware core must not contain feature-specific logic.

---

# Components

Components expose reusable hardware capabilities to the core and modules.

Examples include:

- Display
- LED Strip
- LED Matrix
- Buttons
- Encoders
- Touch Input

Components own capability-level behavior but do not access board-specific hardware directly.

Components depend on interfaces rather than concrete drivers.

---

# Modules

Modules provide user-visible functionality.

Examples:

- Shift Lights
- Lap Timer
- Spotter
- Race Control
- Display Pages

Modules communicate through platform services rather than directly with each other whenever possible.

Modules use components and never access hardware directly.

---

# Platform

Platform code adapts modules and components to framework-specific presentation and runtime facilities.

Dashboard widgets are platform-specific UI. Lap Timer and Delta Time widgets
render their module state. Reusable text widgets receive telemetry handles from
a startup-only widget binder and own only bounded LVGL presentation state.
Widgets do not know protocol identifiers or telemetry field names and do not
own telemetry processing, extrapolation, or correction logic.

Platform code may depend on modules and components. Modules must not depend on platform code or UI frameworks.

Temporary development sources, such as mock telemetry, must remain isolated under `platform/` so production communication can replace them without changing module APIs.

---

# Services

Services provide shared infrastructure used by the core, components, modules, and drivers when appropriate.

Examples include:

- Logging
- Scheduling
- Configuration
- Communication

Services must remain focused and must not contain hardware-specific application logic.

---

# Drivers

Drivers implement hardware-specific functionality.

Examples include:

- Display drivers
- LED drivers
- Encoder drivers
- Touch drivers
- CAN drivers
- USB drivers

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

Communication with external software is handled through dedicated communication layers.

The communication protocol should be isolated from business logic.

Changing the transport should not require rewriting modules.

Possible transports include:

- USB Serial
- WebSocket
- BLE
- Wi-Fi
- Future protocols

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

Firmware builds own an immutable board identity. The board registry maps that
identity directly to drivers for hardware physically built into the board and
keeps private validation metadata for immutable constraints such as logical
display bounds and supported communication pins. This metadata is not part of
the public configuration or device-information protocol.
Firmware reports only the stable board identifier; the configurator maps it to
a local supported board profile containing read-only authoring metadata such as
logical display dimensions. Every user configuration includes a matching board
identifier for compatibility validation. A separate optional bounded list
controls supported configurable hardware devices and may be empty.

The factory user configuration contains only that board identifier. Hardware
declared as built into the board remains enabled; currently, a board-provided
display is initialized by default and exposed to the configurator as a
read-only capability. Additional hardware devices, modules, and widgets are
created only when present in the validated configuration, so a freshly flashed
or reset production device has an enabled display with an empty dashboard.

Public configuration schema 2 uses a bounded sparse JSON document directly for
authoring and device transport. Widget geometry uses absolute logical display
coordinates; regions, region identifiers, and anchors are not part of the
contract. Firmware parses and validates JSON on the configuration/startup path,
then runtime code uses bounded typed structures.

Fonts use a bounded family identifier and pixel size. Only LVGL Montserrat is
compiled into firmware. Configurator-imported fonts are converted to LVGL
binary assets and stored in a separately versioned, checksummed, recoverable
flash asset set; they are not embedded in configuration JSON, configuration
NVS, or the application image. Missing optional assets render through a
compiled Montserrat fallback.

Persistent NVS slot headers, generations, CRC validation, and recovery remain
private to the configuration service. External tools communicate only through
the public configuration control protocol.

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

SimCore runs on FreeRTOS.

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
