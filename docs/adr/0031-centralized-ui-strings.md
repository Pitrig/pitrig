# ADR 0031: Centralized UI Strings

Status: Accepted. Adds a fifth generated contract beside the four in
[ADR 0013](0013-generated-configuration-contract.md), and keeps the debug
application outside its scope on the boundary
[ADR 0028](0028-debug-build-and-debug-application-boundary.md) draws.

## Context

The configurator's user-visible text was written where it is drawn: 1672 unique
strings across 187 files, from one-word buttons to the inspector's paragraphs of
prose. Nothing could be translated, and changing a phrase meant finding every
copy of it first. The strings are also the product's voice, and a voice spread
over 187 files drifts.

Two shapes were available. A TypeScript module per feature keeps the text beside
the code that draws it and needs no generator, but it is not one file, and the
300-line rule would cut the catalog into a dozen pieces. A JSON source with a
generator matches how this repository already treats data two consumers share —
`configuration/configuration_schema.json`, `telemetry/telemetry_catalog.json`,
`fonts/led_bitmap_font.json` — and gives a translator one file to work in.

## Decision

**`i18n/en.json` is the source, and `tools/codegen/ui_strings` generates the
TypeScript.** Strings are nested by feature and addressed by a dotted key.
Placeholders are `{name}`. A `$note` field carries what a translator needs to
know about a placeholder; it is data, not a comment, and never becomes a key.

**Plural messages carry a `$plural` object of CLDR categories** (`one`, `other`,
and whatever else a locale needs), selected at runtime by `Intl.PluralRules`. No
ICU parser and no dependency. The marker is explicit rather than inferred from
the shape of the object, because the catalog also holds maps keyed by enum
members and a device reset cause is legitimately named `other`. The generator
rejects a plural message that omits `other` or never uses `{count}`.

**Two generated files, not one.** `ui-string-keys.ts` holds the `UiStringKey`
union and the per-key parameter types; `ui-strings-en.ts` holds the table under
an explicit `Readonly<Record<string, string>>`. Every call site imports the keys
and only the resolver imports the table, and neither `as const` nor
`keyof typeof` appears — otherwise TypeScript builds a literal type over 1672
entries in each of the three projects that check `src/shared`.

**`t()` in `configurator/src/shared/ui-text.ts` is the only reader**, shared by
the main process and the renderer. Because the keys are literal strings, a
`Record<Enum, string>` label map can be replaced by `` t(`ns.${token}`) `` and
still fail to compile when an enum member has no string — the exhaustiveness
those maps provided is kept rather than traded away.

**The main process resolves its own text.** Dialog titles and file-filter names
go straight to `dialog.showOpenDialog` and the renderer can never draw them, so
a code-on-the-wire scheme would add a second mechanism rather than replace one.
`DeviceError` keeps carrying a resolved `message`.

**No locale setter.** The menu descriptors and the LED profiles call `t()` at
module scope, so a setter called later would leave them frozen and lie about it. The seam for a second locale is the catalog map plus how the locale is
resolved at startup; changing language will restart the window.

**Out of scope, deliberately.** The debug application keeps its own inline text.
Enum members drawn directly as select-option text stay untranslated: they are
the same tokens the user reads and edits in the JSON editor and in
`docs/configuration-schema.md`, and translating them would desynchronise the UI
from the document. Strings that are identity as well as display — an icon's
`name`, an LED effect's `id` — stay out until they are split into an id and a
label, because localising them breaks lookup and corrupts saved documents.

## Consequences

A phrase now has one home, and a second locale is one JSON file plus the line
that picks it. The generator's `--check` runs in CI, so a catalog edited without
regenerating fails the build.

The inspector's prose leaves the module a developer reads while working on that
widget. That locality is a real loss, traded for text that can be translated and
edited in one place.

Text is no longer greppable from the string a user reports; the key is the index
into it instead. An ESLint rule keeps new literal text out of renderer JSX,
but it cannot cover `.ts` modules, where literals are also channel names, board
ids and colours — there the guard is review, not automation.
