# ADR 0023: Dashboard Templates and Cross-Board Layout Transfer

Status: Accepted. Configurator only — no firmware change, no schema change, and
no new property on the configuration contract.

## Context

Widget geometry is absolute logical pixels in one coordinate space
([ADR 0007](0007-dashboard-layout-regions.md),
[ADR 0014](0014-screen-as-composition-primitive.md)). The supported boards are
320×170, 480×480 and 1024×600, so the same document is not the same dashboard on
two of them, and moving one meant rebuilding it by hand.

Every dashboard also started from `{ board }` and an empty screen. The example
documents in the repository were reachable only by knowing their path and using
the Load dialog, so they were not a starting point anybody actually started
from.

Four facts constrain what can be done about either.

- A configuration document may hold nothing the generated contract does not
  declare. The validator walks it against the same allow-list the firmware
  parser uses, so a name, a description or a source board cannot be added to it.
- The document deliberately carries no version field; a document authored
  against an older schema is brought forward heuristically instead
  ([ADR 0013](0013-generated-configuration-contract.md),
  [ADR 0016](0016-runtime-configuration-ownership.md)).
- The device draws an uploaded bitmap at the size it was uploaded at and never
  scales or rotates it ([ADR 0018](0018-uploaded-image-assets.md)), so no
  geometric transform can carry an image asset with the layout that draws it.
- The display size is the only board-dependent constraint the validator applies.
  Every structural cap — screens, the per-type widget pools, nesting depth, tap
  targets, slot pages — is a global constant, so a layout that fits one board
  structurally fits them all.

## Decision

**A template is an envelope, not a decorated document.** It holds `format`,
`format_version`, `name`, an optional `description`, and the payload. The
metadata sits outside because the document cannot carry it; the version sits
outside because the document deliberately has none, and the envelope is the
configurator's own artifact rather than the device contract. There are two
formats. `pitrig-dashboard-template` carries a whole configuration, whose
`board` stays the single source of truth — that envelope does not repeat it,
because a second copy is a copy the two can disagree about.
`pitrig-widget-template` carries one widget with its subtree, and its envelope
does name `board`, because a widget fragment has nowhere of its own to say what
display it was drawn for.

**The library is bundled starters plus saved templates.** The starters are
inlined into the application, because there is no packaging step to copy files
through; the saved ones are one file each under the user data directory,
dashboards in the template folder and widgets in its `widgets` subdirectory. A starter's identifier carries a prefix that the identifier pattern
rejects, so a file can never produce one and one can never name a file — which
makes "a starter is read-only" a property of the scheme rather than a check
somebody has to remember. Both kinds go through the same parse a loaded file and
a device payload go through, so a starter that drifts from the contract fails
visibly instead of shipping.

**Moving a layout scales every pixel-valued property, in one of two fits the
author chooses.** `contain` applies `min(destWidth/srcWidth,
destHeight/srcHeight)` to both axes and centres the result: proportions survive,
and the margin a different aspect ratio leaves shows the screen background.
`stretch` gives each axis its own ratio so the layout fills the display: nothing
is wasted, and round shapes become oval.

Only offering `contain` was the original decision, and it was wrong in practice.
A dashboard is mostly boxes and readouts: a 1024×600 race layout contained onto a
480×480 board covers 56% of it against 96% stretched, and two fifths of a display
left black is not a proportion worth preserving. A layout built around a round
gauge is the opposite case, which is why this is the author's call rather than
ours. `contain` stays the default because it is the fit that cannot distort.

A value with no axis — a font size, a corner radius, a ring thickness, a border
width — follows the smaller ratio under both fits, because a glyph has one size
and scaling it by the larger ratio would overflow the box that grew by the
smaller. Only a directional gap follows its own axis: the four paddings and the
two caption offsets. Neither fit reflows, because moving a widget relative to its
neighbours would need to know what the author meant.

Four rules make that scale safe to apply.

- **The pixel-valued properties are a declared table**, driven by the integer
  kinds the contract states and the range table it generates, rather than a
  switch per widget type — the same reasoning as `childArraysOf` and
  `documentFonts`. A scaled value is clamped to the narrowest of the declared
  integer, the generated range and the field's own rule, and a clamp is reported
  rather than applied silently.
- **Geometry scales its edges, not its extents.** The far edge is scaled and the
  new extent derived from it, so widgets that shared an edge still share it and
  rounding does not accumulate along a row. An extent never rounds below one
  pixel, because the device rejects a document holding a collapsed box.
- **A container's children are stored relative to it**, so both are scaled by
  the same factor and the centring offset is applied only to widgets authored
  directly on a screen.
- **The document is cloned as JSON.** Two widgets sharing one font object would
  otherwise have its size scaled once per widget and compound away to nothing;
  a JSON clone has no shared nodes, which is what guarantees each field is
  scaled exactly once.

**Nothing else moves.** Colours, gradient direction, telemetry bindings and
modifiers, a number transform's scale and offset (a unit conversion, not a
pixel), value windows and thresholds, every duration, the arc's angles, ids,
actions and z-order are carried across untouched.

**The transfer reports what it could not carry, and the result is validated
against the destination before it replaces anything.** The report names image
widgets whose bitmaps now need re-uploading at a new size, fields that hit a
clamp, an arc ring thinned to keep fitting its widget, and any widget that would
land entirely off the destination display. It is structured data; the wording
belongs to the panel that shows it.

**One engine serves every entry point** — converting the draft in place,
applying a template authored for another board, and taking a screen from one.

## Consequences

- A dashboard moves between boards in one action, and the author decides
  between an unused margin and a distortion. Neither fit reflows, so a layout
  that wants a genuinely different arrangement on a differently shaped display
  is still hand work.
- Image assets do not follow. Until each one is converted and uploaded again at
  the size the report names, the widget's box is right and its bitmap is not.
  This is a consequence of ADR 0018 rather than an omission, so it is surfaced
  instead of worked around.
- A template is saved as a whole dashboard or as one widget, never as a single
  screen, but `Add` takes screens out of a dashboard template and appends them
  to the open document, each under the first free `screenN` id and with fresh
  ids for every widget it brings. The ids stay consistent there too: a
  `goto_screen` action among those widgets is rewritten to the new id when the
  screen it names came along, and dropped when it did not, so a fragment cannot
  carry an action naming a screen the destination does not have.
- The envelope is a second persisted format the configurator has to keep
  reading. `format_version` is what makes that survivable, and the configuration
  inside continues through the existing migration.
- Font sizes scale but families do not, and the device rasterizes any size from
  an installed family — so a conversion never changes what has to be uploaded.
  Applying a template authored elsewhere can introduce a family, which the
  existing upload-on-save flow already handles.
- Converting a draft records history rather than replacing the document
  outright, so it is undoable and the selection survives it: a transfer
  preserves every widget and screen id.
- Starters are inlined into the application bundle, so adding one costs bundle
  size and a rebuild.
- The configurator still does not enforce the firmware's rule that two arc ring
  thicknesses must fit across the widget. The transfer repairs the values it
  produces, but a hand-authored arc can still be accepted here and rejected by
  the board; closing that gap in the shared validator remains owed.
