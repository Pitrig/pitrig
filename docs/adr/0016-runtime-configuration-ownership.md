# ADR 0016: Runtime Configuration Ownership

Status: Accepted; supersedes the reboot-only application rule in ADR 0009.
Amended by ADR 0024: staging, promotion and reversion are unchanged and still
operate on one active/scratch pair, but a replacement now carries only one
document's sections. The scratch document is seeded from the active one before
parsing, so the sections it does not own survive the swap, and the
`dashboard_only` comparison is replaced by the document the request named.

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

Let the composition root recompose from the promoted document by tearing the
dashboard down and composing it again — `recompose()` in the core, over the
dashboard composition's existing `destroy` and `create` rather than a second
composition route. Beside it, the dashboard composition offers
`apply_incremental()`, which keeps every widget whose bytes did not change and
touches only what differs; it is taken when the two documents differ in the
dashboard alone, creates any font the new document names before rebuilding and
releases the ones only the old document named after.

Two rules make that pass answer for an ordinary edit rather than for a subset
of them.

**Widgets are addressed by pool index, never by identity.** The parser numbers
widgets in document order, so adding one, deleting one, or moving one between
parents renumbers the widgets after it; the byte compare then sees exactly the
slots whose contents changed, whichever widget now occupies them, and rebuilds
those. A pool that grew is extended with empty slots, which the same
per-instance path then builds; a pool that shrank has its tail released. A
reserved slot is counted before it is built, and the pool's render timer runs on
the LVGL task in between — so an instance holding no object is skipped by the
render pass rather than drawn, which is also what keeps a failed rebuild from
being drawn. Which
parent holds a widget is therefore not structural either: parenting is carried
by the widget's own frame, so a widget dragged into a panel differs in its own
bytes and is rebuilt into the parent the layout now resolves for it — the
reference tables that record the same relationship are deliberately not
compared. What belongs to the parents rather than to the widgets is settled
afterwards for the whole document: what each container clips, the order within
each one, the slots controller's bindings, and the tap targets.

**Containers are updated before what they hold and released after it.** The
types are walked in the order the widget manager registered them — slot, shape,
then the rest — which is the order that has a parent's object existing, and its
geometry and colour final, before anything inside it resolves it. A container is
restyled in place rather than rebuilt: deleting its LVGL object deletes its
descendants with it, widgets other collections own and still point at. So a
shape re-resolves against the replacement and has every style re-applied to the
object it already has, a slot the same for its box and its pages, and a
container that changed parent is moved with `lv_obj_set_parent` so that what it
holds travels with it. Their children keep their objects and their relative
geometry, which LVGL carries with the parent. The caption and its mask are the
exception: they sit on the parent rather than inside the container, so they are
replaced rather than patched. Releasing runs in the mirror order, after every
other type has been walked — by then a widget that survived is standing in the
parent it now belongs to, and the container being released holds nothing.

Rebuilding stays as the fallback for what a restyle refuses — an inset
background appearing or disappearing, which adds or removes a child of the
container — and is taken only while nothing is parented to the object, which the
shape asks LVGL rather than the document: a replacement that moved the last
widget out still has it standing inside until its own rebuild moves it.

What still falls back to the full recompose: a screen removed, a slot whose page
count changed, a font registry with no room for old and new side by side, and
any per-instance update that refuses. Every one of them says so in the log,
because from the outside they are indistinguishable — the display rebuilds.

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
- The `APPLY` control command drives this path. It stages, validates, promotes,
  and recomposes without writing storage, and it is rejected rather than queued
  while another device operation holds the single-slot lock. A dashboard-only
  difference takes the incremental path; anything else, or an incremental apply
  that cannot complete, takes the full recompose, and a recompose that fails
  reverts to the previous document and recomposes from that.
- Live authoring redraws what it touches rather than the screen: editing a
  container, moving a widget into or out of one, adding or deleting a widget,
  resizing a slot, adding a screen. Each of those used to rebuild everything,
  which is what a live apply looks like from the outside — the whole display
  blanking on every edit.
- A slot that changed has its controller rebound, which returns it to its first
  loop page. Editing a slot is therefore visible as the slot resetting, which is
  the one place an incremental apply is not invisible.
- The parse-validate-promote-rebuild order is a real constraint on future code
  and is not enforced by the type system.
- A live apply is complete for any document whose font families are installed.
  Pixel sizes are rasterized on demand (ADR 0010), so only a new family needs an
  upload and a restart.
