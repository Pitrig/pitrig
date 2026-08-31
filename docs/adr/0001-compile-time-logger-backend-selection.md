# ADR 0001: Compile-Time Logger Mode Selection

## Context

SimCore exposes a stable logging API while delegating log processing to ESP-IDF. Logging mode selection must add no runtime dispatch and must not require multiple source files or backend abstractions.

## Decision

Keep the standard ESP-IDF logger as the backend and select its logging mode at compile time inside the single logger implementation. Simple mode is the default. Defining the full-mode flag enables formatted, level-aware forwarding without changing the public API.

## Consequences

- Only the selected logging mode is compiled into the firmware.
- Logging mode cannot be changed at runtime.
- Logger call sites and the public API remain unchanged.
- The API's reach stops where the layer graph does. `core/`, `services/` and
  `platform/` call `log::`; `drivers/` and `components/` call ESP-IDF's
  `ESP_LOG*` directly, because both depend only on `interfaces/` and a
  dependency on the logger service would invert the layering. Both paths end in
  the same backend, so the console-port link's `esp_log_set_vprintf` silencing
  covers them together.
