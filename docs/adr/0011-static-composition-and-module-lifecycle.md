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

Keep immutable board capabilities in one `BoardDefinition`. A dedicated
platform telemetry transport composition owns and configures only the concrete
UART and/or USB CDC adapters supported by that board. The core sees only the
neutral transport interface. Split feature-module lifecycle and LVGL dashboard
creation into separate module and dashboard composition components.

Keep the bounded schema 2 value contract in its own `configuration_contract`
service component. The configuration service consumes that contract for
parsing, validation, persistence, and control operations. Modules and dashboard
widgets consume the neutral contract directly instead of depending on the
configuration service or making it depend on feature or LVGL implementation
headers.

Keep transport-facing configuration commands in a separate
`configuration_control` service. The configuration service itself owns only
schema parsing, validation, persistence, and current configuration state.

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
- Adding a board changes one immutable board definition and its platform
  adapters without adding hardware switches to the core.
- Configuration schema types no longer live under `platform/` or import widget
  and module implementations.
- Feature modules and dashboard code do not inherit the configuration
  service's storage, JSON, control-protocol, or ESP application dependencies.
- The architecture documents service composition rather than claiming a
  runtime Service Registry or central Scheduler exists.
