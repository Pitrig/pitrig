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
- hardware drivers
- communication settings
- layouts
- device capabilities

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

Dashboard widgets are platform-specific UI. They render module state with LVGL but do not own business state, telemetry processing, extrapolation, or correction logic.

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

- desktop companion application
- dashboard builder
- plugin system
- scripting
- additional communication protocols
- new hardware families

Future capabilities should integrate into the existing architecture without requiring major redesign.
