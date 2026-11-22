# ADR 0044: Generated Protocol Tokens

Status: Accepted. No change on the wire: the same bytes, written from one source.

## Context

The board, the configurator and the SimHub plugin talk through line prefixes:
`@PR:` starts every line of the control protocol
([control-protocol.md](../control-protocol.md)) and `@PT:` the plugin's own
lines to the configurator ([ADR 0034](0034-configurator-telemetry-bridge.md)).
Each program spelled them itself, about a hundred times in three languages.
After the rename of 2026-09-05 the firmware router still compared lines with
`{'@', 'S', 'C', ':'}` while every other place wrote `@PR:`, so the board
ignored every command — and every gate passed, because a text search does not
find a token spelled one character at a time.

## Decision

**One source owns the prefixes.** `configuration/control_protocol.json` names
them, and `tools/codegen/control_protocol` writes them for the three programs:
`control_protocol_generated.hpp` in the header-only leaf component
`services/control_protocol`, `configurator/src/shared/control-protocol.ts` and
the plugin's `ControlProtocol.g.cs`. The configuration contract stays free of
protocol, as [architecture.md](../architecture.md) requires.

**Firmware joins the prefix to a literal at compile time.** The header defines
`PITRIG_CONTROL_PREFIX` as a string literal, so a reply is written
`PITRIG_CONTROL_PREFIX "ERR:busy\n"` and a `snprintf` format stays one literal;
`protocol::kControlPrefix` holds the same text as a `std::string_view` for
comparisons. A macro is the one form that joins a literal without a buffer.

**No program spells a prefix.** The generator's `--check` also scans
`firmware/`, `configurator/src/` and `simhub/plugin/` outside its own outputs
and fails on any line that holds a prefix or spells `'@', 'X', 'Y', ':'` in
characters. Documentation, JSON data and `tools/` are not scanned: they
describe the protocol rather than speak it.

**Only the prefixes.** Command and reply words — `INFO`, `OK`, `ERR` and the
rest — stay in the code and in control-protocol.md, and the validation reason
tokens were already generated from the configuration schema. A word joins the
source when it too needs a single owner.

## Consequences

- The bytes on the wire do not change, so every mix of releases behaves as
  before.
- Renaming a prefix is one edit and a regeneration; a stale output or a prefix
  written by hand fails `--check` in CI.
- The macro is visible in every file that includes the header, so its name
  carries the `PITRIG_` prefix like the Kconfig aliases.
