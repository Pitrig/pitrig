# ADR 0013: Generated Configuration Contract

Status: Accepted; supersedes the schema 2 document shape defined by ADR 0009

## Context

The configuration contract existed twice by hand: bounded C++ structures in
`configuration_contract`, and a TypeScript mirror in `configurator/src/shared`.
Nothing cross-checked them, and they had drifted. The configurator emitted a
`#00000000` background sentinel firmware rejects outright, its Delta Time colour
and range defaults disagreed with the firmware defaults, and its main-process
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

Raise the schema to version 3 and put the version inside the document instead of
leaving it implicit in the firmware build. Schema 2 records are not migrated;
they are unsupported and startup falls back as ADR 0009 already specifies.

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

## Consequences

- A property or widget type is added in one document; C++, TypeScript, parser
  allow-lists, and the property reference follow.
- Firmware and configurator cannot disagree about the contract's shape, because
  neither writes it.
- The configurator rejects what the device rejects, before transmitting.
- A rejection identifies the widget and property that caused it.
- Adding a widget type no longer touches roughly nineteen sites.
- Schema 2 documents are rejected; existing device configurations are discarded
  and must be authored again.
- `configuration/configuration_schema.json` and the generator become part of the
  public contract: editing generated files directly is a defect, and `--check`
  belongs in any verification pass.
