# ADR 0011: Static Composition and Module Lifecycle

## Context

The architecture named a Service Registry, Module Lifecycle, and Scheduler as
firmware-core responsibilities, but the implementation manually constructed
services, started each concrete module, and wired the SimHub protocol directly
inside the core. A runtime service locator would hide dependencies and add
lookup machinery without helping the fixed embedded application.

## Decision

Use one static application composition root for firmware-lifetime ownership.
Group platform adapters separately from application services and pass service
dependencies explicitly by reference. Do not introduce a runtime Service
Registry or global service lookup.

Use a bounded Module Manager in the core infrastructure. Platform composition
registers compile-time module descriptors containing an enabled flag, function
pointers, and an explicit context pointer. The manager starts enabled modules,
tracks successful starts, and stops them in reverse registration order. It
performs no allocation, RTTI, or name-based runtime lookup.

Keep transport, control routing, binary font upload routing, and the concrete
telemetry protocol in a platform communication composition. The core supplies
the selected transport and shared services but does not depend on SimHub or
protocol routing details.

The configuration service owns the bounded schema 2 value contract. Modules
and dashboard widgets consume those neutral values instead of making the
configuration service depend on feature or LVGL implementation headers.

Delegate scheduling to the owning subsystem: FreeRTOS tasks for blocking or
long-running service work, LVGL timers for rendering, and event callbacks for
short module updates. Do not add a central scheduler until a cross-subsystem
scheduling requirement is identified and recorded by another ADR.

## Consequences

- Service ownership and dependencies remain explicit and statically bounded.
- Adding a module changes its implementation and the application registration
  table, not the Module Manager.
- Module shutdown order is deterministic.
- Replacing SimHub or adding another protocol does not require protocol code in
  the firmware core.
- Configuration schema types no longer live under `platform/` or import widget
  and module implementations.
- The architecture documents service composition rather than claiming a
  runtime Service Registry or central Scheduler exists.
