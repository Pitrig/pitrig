# ADR 0041: Dashboard Files

Status: Accepted. Configurator only — no firmware change and no schema change.

## Context

A dashboard names its images and fonts by identifier, and an identifier resolves
only on the PC that holds the image library and the font library behind it
([ADR 0018](0018-uploaded-image-assets.md), [ADR 0010](0010-uploaded-font-assets.md)).
A configuration file carries the document alone, so on another PC the same
dashboard drew named boxes and stand-in faces, and the board refused it. Sharing
one has to carry what the names point at, and stay small enough to pass around a
forum or a chat.

## Decision

**One `.pitrigdash` file holds one dashboard.** It is a 16-byte prefix — the
magic `PTRGDASH`, a container version and the header length — a JSON header,
and the blobs. The header is the dashboard template envelope of
[ADR 0023](0023-dashboard-templates-and-layout-transfer.md) at `format_version`
2: name, description, the app and schema versions that wrote it, and a
descriptor per image and font. Every blob is compressed on its own with Brotli
and listed with its decoded size and SHA-256. Base64 inside JSON was the simpler
format and a third larger; ZIP needed a dependency or a reader of our own.

**It carries the dashboard document only.** The modules and protocol documents
describe one board's wiring and link, so opening a file replaces the open
dashboard and keeps the LED and connection settings of the board in hand, as a
template's `Use` does, and scales the layout to that board's display.

**A template in the library is such a file too.** `Save to templates` writes
one, `Use` and `Add` open it the way a shared file is opened, and the card's
Share writes it out unchanged. A widget template carries its widget in the
smallest document that holds it, with `template: "widget"` in the header; the
library's Open adds a received file of its own kind, and the configuration
`Open…` refuses a widget file. A `.json` template saved by an earlier version is
converted once, with the images and fonts of the PC that holds it.

**Images travel as the exact bytes a package entry holds**, straight alpha, not
as PNG: Electron's PNG path moves partly transparent pixels, and the board must
receive what the author's board received. **Fonts travel by what the other PC
can get:** a built-in face by its id, a Google face by family and weight and
downloaded on open, and only a face imported from a file is embedded.

**Opening checks everything before it changes anything.** Every blob is
decompressed under its declared size and compared with its hash, the
configuration goes through the same migration and validation as any file, and
only then do images and fonts enter this PC's libraries. An identifier this PC
already uses for the same content is reused; for different content the arrival
takes a free name (`logo-2`) and the dashboard is rewritten to it, so the PC's
other dashboards keep their own. Opening the same file twice adds nothing.

**Readers ignore what they do not know.** An unknown header field is skipped and
an unknown font source counts as a missing font, so an addition does not need a
new version. The version rises only for a change an older reader would misread
— a new codec or layout — and such a file is refused with the version that
wrote it, rather than half read.

## Consequences

- Measured on real artwork: an icon is 8 KB, a 12-frame sprite sheet 4 KB, a
  full-screen photograph about 300 KB. A board holds 7 MB of images, which
  bounds what a working dashboard carries.
- A Google face needs the internet once, on open or on the next save; without it
  the canvas draws a stand-in and the report names the face.
- An embedded face is checked for its size and signature only before it
  reaches the board's rasterizer, as an imported face always has been.
- Configurators older than this one cannot open a `.pitrigdash` file.
- A configurator from before templates became files lists none of them, and
  opens a widget file as a dashboard holding that one widget.
- Removing an image or a face from the PC's library no longer breaks a template:
  `Use` and `Add` bring back what the file carries.
- Double-clicking a file in Explorer or Finder does not open it yet: that is an
  installer change and a Windows check.
