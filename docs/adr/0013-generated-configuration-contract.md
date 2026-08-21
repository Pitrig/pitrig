# ADR 0013: Generated Configuration Contract

Status: Accepted; supersedes the document shape defined by ADR 0009. Amended by
ADR 0024: the single root struct is still generated and is still the one runtime
document, but the schema now also declares the three documents it is transferred
and stored as, and the generator emits a key allow-list, a payload bound and a
restart rule for each.

## Context

The configuration contract existed twice by hand: bounded C++ structures in
`configuration_contract`, and a TypeScript mirror in `configurator/src/shared`.
Nothing cross-checked them, and they had drifted. The configurator emitted a
`#00000000` background sentinel firmware rejects outright, several of its widget
defaults disagreed with the firmware defaults, and its main-process
validation checked a few node shapes while firmware rejected unknown properties
outright — so the configurator could ship payloads the device refused.

The parser spelled eighteen property allow-lists inline. Widget kind was encoded
structurally, by which field of the dashboard a widget lived in, so "two widget
types" was baked into roughly nineteen sites across firmware and configurator.
Rejections carried a bare token: a sixteen-widget dashboard with one bad pixel
answered `invalid_widget`, with no widget index and no property name.

The repository already solves exactly this problem for telemetry:
`tools/generate_telemetry_catalog.py` generates six consumers from one JSON
document.

## Decision

Describe the configuration contract once, in
`configuration/configuration_schema.json`, and generate its consumers with
`tools/generate_configuration_schema.py`. The generator mirrors the telemetry
catalog generator, including a `--check` mode that reports staleness instead of
writing.

Generate the bounded C++ structures, capacities, enumerations and their wire
spellings; the parser property allow-lists; the configurator types, limits and
key tables; and the mechanical property reference in
`docs/configuration-schema.md`. Keep as hand-written only what is logic rather
than shape: helpers over the generated storage, the private `ValidationContext`
that validates a document against immutable hardware, and semantic validation.

Put the schema version inside the document instead of leaving it implicit in the
firmware build, and raise it whenever the shape changes. A record of an
unsupported version is not migrated; startup falls back as ADR 0009 specifies.

Discriminate widgets by an explicit `type` tag inside one heterogeneous
`widgets` array, replacing structural encoding. Give every widget and screen a
stable `id`, so selection, history, and any future addressing survive
reordering and deletion. In firmware the array is stored as an ordered
`WidgetReference` table — type, index into typed storage, and the `z_index`
ordering key — beside per-type bounded arrays. This keeps storage static and
bounded and needs no union.

Carry rejection context on the wire. `ValidationFailure` adds the screen index,
widget index, and the property path to the reason token, and the control
protocol appends them after the existing token so current hosts still parse the
reason. Add `unknown_property` and `duplicate_property` as distinct reasons.

Use one validation implementation in the configurator, driven by the generated
allow-lists, shared by the renderer, the main process, and file import.

Extend "shape" to include the bound on a single numeric property. A field may
state `minimum` and `maximum` — a literal, or the name of a limit already
declared in the same document — and `zero_means_off` for a property a zero
switches off rather than sets low. From those the generator writes the firmware
validator's range check, the configurator's range pass, the bounds its number
fields offer, and the accepted window in the property reference. The blink and
hold bounds move into the document for the same reason, having been three hand
copies of one decision.

This covers only what two numbers can express. A rule that reads more than one
property — a ramp whose stops must climb, an arc whose ring has to fit its
widget, a slot page whose trigger decides what else it may carry — stays
hand-written on both sides and stays deliberately paired by comment, because
generating it would mean describing logic in JSON.

## Consequences

- A property or widget type is added in one document; C++, TypeScript, parser
  allow-lists, the range checks on both sides, and the property reference
  follow. A new numeric property is bounded by writing two numbers next to its
  default rather than by remembering four separate places.
- The property reference prints the window the device accepts. It previously
  printed the range of the storage type, which advertised values every one of
  those properties was rejected for.
- Firmware and configurator cannot disagree about the contract's shape, because
  neither writes it.
- The configurator rejects what the device rejects, before transmitting —
  including a value outside its range, which it previously passed on for the
  device to refuse.
- A rejection identifies the widget and property that caused it.
- Adding a widget type no longer touches roughly nineteen sites.
- A document of an unsupported version is rejected rather than guessed at, so a
  contract change costs one re-authoring rather than a silent misreading.
- `configuration/configuration_schema.json` and the generator become part of the
  public contract: editing generated files directly is a defect, and `--check`
  belongs in any verification pass.
