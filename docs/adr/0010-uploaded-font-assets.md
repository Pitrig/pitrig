# ADR 0010: Uploaded Font Assets

Status: Accepted; revised to store font faces and rasterize sizes on the device

## Context

Dashboard fonts were compiled into the firmware as generated C sources. Every
new family or size therefore increased the application image and required a
firmware rebuild and reflash. This does not fit a configurator-first workflow
where fonts are project assets selected by the user.

Font data can be much larger than runtime configuration. It must not be placed
inside the sparse JSON payload or the configuration NVS records. The upload
path must detect incomplete or corrupt packages even though no second copy is
retained for rollback.

## Decision

Replace the closed compiled-font enumeration with a stable bounded font family
identifier and pixel size. The public configuration schema stores a font as:

```json
{
  "family": "roboto-black",
  "size_px": 48
}
```

Family identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`, or
`-`. Font sizes are integers from 1 through 255 pixels. Production firmware
exposes no built-in dashboard font family. Family resolution is exact: a
missing family is an explicit dashboard composition error and is not silently
replaced with another font. Debug builds may retain private framework fonts for
service UI, but the dashboard registry never resolves them by public family
identifier.

The configurator uploads the imported TTF or OTF face unchanged, one per
family, and the device rasterizes every pixel size a configuration asks for.
A device asset is keyed by family alone; editor display names and source
metadata remain project-only data. Storing faces rather than converted bitmaps
removes the conversion step, makes a size change a configuration change instead
of an upload, and stops the device from holding glyphs it never draws — a
192 px family converted for every printable character is close to a megabyte of
which a dashboard uses a dozen glyphs.

A package holds at most 8 families, and a configuration may name no more than
that. Pixel sizes are unbounded by storage because they cost nothing there;
each family and size a configuration references becomes one runtime font
object.

Font assets live outside the application image and configuration NVS in one raw
2 MiB `font_assets` partition. The package contains a bounded manifest followed
by face data. The manifest owns a format version, bounded entry count, and for
every entry its family identifier, offset, length, and CRC32. Package-level
validation covers the complete stored asset set and includes an sfnt signature
check, because a face is parsed while rendering rather than at load.

An upload erases and replaces the single partition. Bytes after the header are
written first; firmware validates every bound and checksum before writing the
header last. An interrupted upload therefore leaves an invalid package rather
than a partially committed one, but the previous package is not recoverable.
The new package becomes active only after reboot. At startup the package is
memory-mapped read-only and every face is copied into external RAM before any
font is created. The rasterizer re-reads the face on each glyph cache miss, so
that copy is what keeps live fonts valid when a later upload releases the
mapping while the dashboard is still rendering.

Each runtime font owns a bounded cache of rendered glyphs. Those glyph bitmaps
are allocated through LVGL's font draw-buffer handlers, which the platform
points at external RAM: the ESP-IDF allocator keeps blocks below its internal
threshold in internal memory, and a single 192 px glyph sits just under it.
Fonts are created without kerning so a cached advance width does not depend on
the neighbouring glyph, which is what allows dashboard composition to pre-warm
each font one glyph at a time — the digits and separators the runtime emits
plus the characters the configuration itself supplies. A character outside that
set is rasterized when first drawn.

Asset upload uses a dedicated bounded, stop-and-wait protocol over the selected
serial transport, separate from configuration `SET`. Binary frames carry an
explicit type, sequence, bounded payload length, and CRC32. Flash erase and
write operations run in a dedicated static task rather than the transport RX
task. A separate `FONT:INFO` query exposes storage and package availability,
format version, the installed family catalog, package size, and pending-reboot
state.
The bounded `FONT:CLEAR` command erases the complete package and requires a
reboot; individual assets are not deleted independently.
Configuration may reference a family that is not installed, but dashboard
composition reports that unresolved dependency instead of substituting another
font. A pixel size is never an unresolved dependency: it is rasterized on
demand.

## Shared upload engine

Fonts were the first uploaded asset kind and this decision was written for
them; images then arrived on the same terms. The engine, the claim and the
package header are described once, in
[ADR 0018](0018-uploaded-image-assets.md), rather than kept in step by hand in
two places.

## Consequences

- Adding a custom font will not require rebuilding or reflashing firmware.
- Production firmware keeps no dashboard font family in its application image.
  Diagnostic-only framework fonts are not part of the public resolver.
- Persisted font bytes consume dedicated flash rather than configuration NVS or
  the application image, and hold one face per family instead of one bitmap set
  per family and size.
- Changing a font size needs neither an upload nor a reboot. Adding a family
  needs both.
- Rasterization moves to runtime. Composition pre-warms the glyphs a dashboard
  draws, so periodic frames hit the cache; an unwarmed character costs one
  longer frame.
- A malformed face is rejected at commit by the signature check and, failing
  that, when its font is created during composition — not inside a frame.
- Replacing a package requires a reboot before the new faces are used.
- An interrupted update can remove the previous package; there is no second
  slot or rollback generation.
- The configurator resolves the families a document names against its font
  library, builds the package from them, uploads it, and only then saves the
  configuration. It carries no font converter, and asks for a file only when a
  family cannot be resolved.
- Every device connection performs a fresh configuration and font manifest
  probe. Reconnecting clears transient validation and upload feedback before
  the configurator evaluates the newly reported device state.
- Firmware still validates identifier syntax, sizes, manifest bounds, and
  checksums; configurator validation does not replace the device trust
  boundary.
- The single partition, bounded asset service, read-only flash mapping, and
  LVGL font registry are implemented. The exact package contract is
  documented in [Font asset storage](../font-assets.md).
- Text metrics come from the face rather than from a converter.

## Amendment: the binary stream is shared

Uploaded images arrived with ADR 0018 and use the same `SCF1` frames over an
`@SC:IMAGE:` namespace. One serial link cannot carry two binary sessions, so the
font control no longer decides for itself whether it owns the byte stream: it
takes a claim, synchronously on the task that reads the bytes, inside its
`BEGIN` handler, and answers `busy` when another kind holds it. Storage moved to
the shared `asset_storage` contract at the same time; the font package format
and everything above it are unchanged.

## Amendment: the configurator keeps a copy of the images it installs

An uploaded image under [ADR 0018](0018-uploaded-image-assets.md) is converted
before it is sent and the converted pixels exist nowhere else: the device holds
no decoder and hands nothing back, and the picked source file is a path held in
memory for the length of one session. Without a copy the canvas would fall back
to a named box for the rest of the project's life.

**Decision.** The configurator writes each image it installs to a cache under
the app's `userData` directory, re-encoded from the *converted* pixels so the
preview carries the resize and the colour reduction the upload applied. Faces
are deliberately not cached: the font library below owns them and answers
whether or not a board was ever given them.

The cache mirrors a device package rather than anything the author wrote, so:

- it is replaced whole on upload and emptied on clear, exactly as the package
  it stands for;
- nothing depends on it. A missing, stale or unreadable entry costs the preview
  its fidelity and falls back to the named image box — never the upload, the
  document, or validation;
- it stays out of the saved project. A project is a sparse configuration
  document, and binding megabytes of asset to it is a separate decision about
  the project format that this does not take.

**Consequences.**

- An image drawn on the canvas is the bitmap the board holds, but only for one
  installed by *this* installation; someone else's project draws a named box
  until its images are uploaded here.
- Glyph rasterization still differs: the browser and LVGL's TinyTTF hint and
  antialias differently, so the preview matches the board's layout, not its
  pixels.

## Amendment: a family is chosen from a library, not named

The identifier above was authored as free text. Nothing suggested one, nothing
validated one, and binding a face to it was a second, manual act in a different
panel — so the common path to a working dashboard ran through naming a thing
that did not exist yet and then explaining to the configurator what it was.

**Decision.** A family identifier is *derived* from an entry in a font library
the configurator owns, and never typed. The library has three origins: a curated
set bundled with the application, faces downloaded on demand from a checked-in
Google Fonts catalog, and files the author imports. Installed operating-system
fonts are deliberately not a fourth: a system face cannot be re-derived on
another machine from the document alone, and the document is the only thing that
travels.

A weight or a style is its own library entry, its own family identifier and one
of the eight slots — the device holds one face per family, so `roboto` and
`roboto-bold` are two families and the editor says so before the author spends
the second slot.

The document's `family` string *is* the library id. There are no aliases, no
per-project mapping and no change to the configuration contract; renaming a font
is not a concept, because a different face is a different family. Identifier
derivation is therefore pure — a slug of the name, then `_` and a word for the
variant, truncated with a short content hash when it would exceed the 31-byte
field — so two installations derive the same identifier for the same face and a
document authored anywhere resolves anywhere the library can answer.

The underscore is not cosmetic. A slug maps everything outside `[a-z0-9]` to
`-`, so a slug can never contain one, and that is what stops a family *name*
from being read as a variant: with `-` as the separator, the family "Archivo
Black" and the family "Archivo" at weight 900 both derive `archivo-black`, and
two faces sharing one identifier makes the document key unsound. The catalog
generator checks every identifier it could produce for exactly this and refuses
to write a catalog that contains a collision.

The library is the author's; the package is the board's; they meet only at save.
Saving to a board resolves every family the document names, builds a package
holding exactly those and no more, compares it against what the device reports,
uploads only on a difference, saves the configuration, and reboots. A family the
library cannot answer for stops the save before a byte is written and asks for a
file. Live apply is suppressed while the draft names a family the board does not
hold, because firmware rejects such a document whole; the canvas shows the new
face and says so.

**Consequences.**

- Preview fidelity no longer depends on *this* installation having uploaded the
  face. It depends on the library resolving the identifier, which a bundled or a
  Google identifier does on any machine. Only an imported face is local.
- The eight slots are spent by the author's choices in the editor, including the
  dashboard default, and the editor reports the cost as it is spent rather than
  at the device's refusal.
- Pruning to exactly what the document names means one board serving two projects
  loses the other project's families on every save. That follows from replacing
  the package whole and is not worked around.
- The Google Fonts catalog is a checked-in snapshot, so a face added upstream
  needs the generator re-run and the result committed — the same trade the
  telemetry catalog already makes.
- Nothing parses the face. An imported file's real family name and weight are
  unknown to the configurator, so an imported entry is named from the file and
  its variant is the author's claim rather than a verified fact.
