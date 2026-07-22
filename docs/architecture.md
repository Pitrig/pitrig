# SimCore Architecture

## Overview

SimCore is a modular firmware platform for building sim racing hardware using ESP32.

The architecture is designed around a small, hardware-independent firmware core with interchangeable modules and hardware drivers.

The primary goal is long-term maintainability, modularity, and extensibility. Every architectural decision should make the platform easier to extend without modifying existing components.

---

# Core Principles

The firmware is built around several strict principles.

## Modularity

The system is composed of independent modules.

Each module is responsible for a single feature.

Modules should be reusable across different devices.

Adding or removing a module should not require changes to unrelated modules.

---

## Separation of Responsibilities

Business logic and hardware logic are always separated.

Modules implement functionality.

Drivers implement hardware access.

The firmware core coordinates everything.

---

## Hardware Independence

The firmware core must never depend on specific hardware.

Displays, LEDs, buttons, encoders, touch panels and future peripherals are accessed only through platform interfaces.

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
      |   Modules   |       |   Modules   |      |   Modules   |
      +------+-----+       +------+-----+       +------+------+
             |                    |                    |
             +---------+----------+--------------------+
                       |
                Platform Interfaces
                       |
        +--------------+--------------+
        |                             |
   Display Drivers              Input Drivers
        |                             |
   ST7789, GC9A01...           Buttons, Encoder...
```

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

# Modules

Modules provide user-visible functionality.

Examples:

- Dashboard
- Button Matrix
- RGB Lighting
- Shift Lights
- Spotter
- Race Control
- Display Pages

Modules communicate through platform services rather than directly with each other whenever possible.

Modules never access hardware directly.

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

Drivers expose common interfaces used by modules.

Drivers should not contain application logic.

---

# Platform Interfaces

Interfaces define contracts between modules and drivers.

Modules depend on interfaces rather than implementations.

Every hardware implementation should satisfy the same interface.

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

Rendering code should target abstract drawing interfaces.

Display drivers are responsible for transferring rendered data to hardware.

DMA should be preferred whenever supported.

---

# Extending SimCore

Adding a new feature should usually involve:

1. Creating a module.
2. Reusing existing interfaces.
3. Reusing existing services.
4. Implementing a driver only if new hardware is introduced.

The firmware core should rarely require modification.

---

# Architectural Rules

The following rules should always be respected.

- The core must not know specific hardware.
- Modules must not access hardware directly.
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