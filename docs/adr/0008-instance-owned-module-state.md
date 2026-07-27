# ADR 0008: Instance-Owned Module State

## Context

Modules need mutable runtime state and Event Bus subscriptions. Namespace-global
state hides ownership, prevents independent instances, makes repeated startup
unsafe, and complicates isolated tests.

## Decision

Keep each module's mutable state, synchronization, telemetry reader, and Event
Bus subscription inside a non-copyable module instance. The application core
owns module instances for the firmware lifetime and explicitly starts them.
Stopping or destroying a started module removes its subscription.

Platform widgets receive the module instance they render as an explicit
dependency. Module instances use fixed object storage and do not require dynamic
allocation.

## Consequences

- Module ownership and lifetime are explicit in application composition.
- Repeated `start()` cannot silently add another subscription.
- Modules can be instantiated independently in tests or future configurations.
- Widgets no longer depend on hidden namespace-global module state.
- The application must keep module instances alive for as long as their widgets
  and Event Bus subscriptions can access them.
