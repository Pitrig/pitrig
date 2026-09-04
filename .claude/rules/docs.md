---
paths:
  - "docs/**"
  - "README.md"
  - "AGENTS.md"
  - ".claude/rules/**"
---

# Documentation guidance

Documentation stays minimal (AGENTS.md): a line in an existing document over a
new section, and a new document needs a reason. Who owns what:

- `docs/architecture.md` — layers, dependency direction, what each directory
  holds, startup order, the event system and core pinning.
- `docs/device-configuration.md` — board identity, the three documents and
  their presence rules, authoring in the configurator, fonts, the payload;
  `docs/dashboard-widgets.md` — screens, containers, slots, widget types,
  captions, conditional styling and ramps; `docs/control-protocol.md` — the
  `@SC:` commands, the `INFO` and `DIAG` replies, error tokens and NVS records.
- `docs/font-assets.md` owns the `SCF1` upload protocol; `image-assets.md` and
  `ota.md` describe only what differs per kind.
- `docs/runtime-performance.md` — counter definitions, the cost model and the
  authoring rules. Measurement history and rejected experiments belong to the
  ADR that owns the decision (0026, 0027, 0032).
- `docs/adr/` — one decision each, Context / Decision / Consequences. Amend in
  place and state the current rule in the Decision rather than appending a
  reversal.
- `docs/configuration-schema.md` and `docs/telemetry-catalog.md` are generator
  outputs: never edit them; change the source JSON or the generator and
  regenerate.

ADRs are cited by bare number from `firmware/utils/simcore_config/Kconfig`,
`configuration/configuration_schema.json` and `.vscode/tasks.json`, and by
number in prose everywhere: never renumber, merge or delete an ADR file. Nothing
validates markdown links, so when a section moves keep the anchors others link
to (`device-configuration.md#authoring-in-the-configurator`,
`control-protocol.md#control-commands`, the ADR 0018 amendment on the image
cache) or update every reference. Claude Code reads only `CLAUDE.md` and its
`@`-imports at startup and these rules only when a matching file is read; plain
markdown links are not followed, so guidance that must be seen goes in the file
the reader will open.
