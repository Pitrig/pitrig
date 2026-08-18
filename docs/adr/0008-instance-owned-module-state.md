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

Synchronization is a member for the same reason the state is: a module is
updated on the task that publishes telemetry and read on the LVGL task, and the
lock that reconciles the two (a `std::mutex` in the Lap Timer) belongs to the
instance whose state it guards.

Platform composition provides module instances to the adapters that consume
them, either a dedicated widget or a pre-bound value-pipeline callback. Module
instances use fixed object storage and do not require dynamic allocation.

Apply the same ownership rule to dashboard views: timers, LVGL objects, cached
presentation values, and transport observers belong to the view instance and
are released by its lifecycle API.

## Consequences

- Module ownership and lifetime are explicit in application composition.
- Repeated `start()` cannot silently add another subscription.
- Modules can be instantiated independently in tests or future configurations.
- Platform adapters no longer depend on hidden namespace-global module state.
- The application must keep module instances alive for as long as their
  adapters and Event Bus subscriptions can access them.
