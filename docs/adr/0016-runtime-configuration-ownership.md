# ADR 0016: Runtime Configuration Ownership

Status: Accepted; supersedes the reboot-only application rule in ADR 0009

## Context

ADR 0009 made a saved configuration take effect only after restart. That kept
the runtime document immutable and was enough while the configurator's only
verbs were save and reboot.

Applying a configuration without restarting was blocked by ownership, not by
missing code. The service held one runtime document and one scratch document as
members and promoted by copying the whole 4348-byte structure over the live one.
Any consumer reading during that copy would see a half-written document. The
text-widget binder additionally stored a `const Config*` into the configuration
document, so replacing the document left the binder pointing into storage that
no longer described the dashboard. Both documents also sat in internal RAM,
about 8.5 KiB of it.

Composition could be torn down — `destroy()` existed on every view — but nothing
composed it again.

## Decision

Separate the persisted configuration from the active runtime configuration.
Persistence keeps the two-slot NVS strategy from ADR 0009 unchanged: magic,
record and schema versions, size, generation, CRC32, write-and-verify the
inactive slot before selecting it.

Hold the runtime configuration as two bounded documents: the active one every
consumer reads, and the scratch one a replacement is parsed and validated into.
Promotion swaps the two pointers. A replacement therefore never overwrites the
document the current composition was built from, and promotion cannot be
observed partially completed.

Place both documents in the existing platform-owned external-memory arena
alongside the payload, NVS record, and control workspaces, keeping them off the
internal heap.

Let the binder own everything it produces. `BoundConfig` holds no pointer into
the configuration document; configurations travel to widget creation as a
parallel span instead.

Provide `rebuild()` in the dashboard composition, tearing the dashboard down and
composing it again from a supplied document. It reuses the existing destroy and
create paths rather than adding a second composition route.

Any path that applies a configuration at runtime must observe one ordering
constraint: parse into scratch, validate, promote, then rebuild. The
configuration document is read only during composition; periodic render paths
read pre-bound callbacks and cached presentation state, never the document. Code
introduced between promotion and rebuild must not read the document.

Installing a font package still requires a restart. Fonts are loaded into LVGL
once per boot, so a configuration referencing a font that is not yet installed
cannot be applied without one. Revisiting that belongs to ADR 0010.

## Consequences

- The runtime document can be replaced without a restart without any consumer
  observing a partial or stale structure.
- Promotion is a pointer swap rather than two 4348-byte structure copies, and
  about 8.5 KiB of internal RAM moves to external memory.
- The binder holds no foreign pointers, so its lifetime no longer depends on the
  configuration document's.
- `rebuild()` exists and is covered by the startup path, but nothing calls it:
  the control command that would, and its interaction with the single-slot
  device operation lock, are a separate decision.
- The parse-validate-promote-rebuild order is a real constraint on future code
  and is not enforced by the type system.
- New font sizes still require an upload and a restart, so a live apply is
  complete only for documents whose fonts are already installed.
