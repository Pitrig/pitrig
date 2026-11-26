# ADR 0047: Display Colour Profiles

Status: Accepted.

## Context

The Guition JC1060P470C's JD9165 panel was measured on 2026-11-25 against an
sRGB reference: a phone camera read in RAW, calibrated on a display in its sRGB
preset to 0.23 ΔE2000. The panel's white sits at xy 0.238/0.237, its mid-tones
follow a gamma of 2.5, and its red and blue are less saturated than sRGB, so a
dashboard landed 12.3 ΔE2000 from the configurator's preview on average. The
JD9165 has one analog gamma curve for all three channels and no per-channel
gain, so its registers cannot balance it, and a correction of every pixel at
flush would cost every frame.

## Decision

- A display driver may name a measured `ColorProfile` (`interfaces/display`):
  the XYZ of its three primaries and the light of every 8-bit drive level of
  each channel. Only the JC1060P470C has one.
- `platform/display_color` turns it into a `Correction`. An sRGB colour's
  target is its XYZ scaled to the brightest D65 white the panel reaches. Each
  channel's wanted light falls between two panel levels (5/6/5, or 8/8/8 in a
  24-bit build); of the eight combinations the drive is the one closest to the
  target in CIE94. A wider CIEDE2000 search measured 0.13 ΔE2000 better on
  average, an invisible gain that cost images their speed.
- The correction runs where the `dashboard` document is parsed and validated
  (`ValidationContext::dashboard_colors`), on every field the generated
  `for_each_dashboard_color` reaches, so the configuration in memory holds
  drive values. Two colours the panel cannot tell apart keep distinct values
  through the lowest bit of each channel, which RGB565 does not show and a
  24-bit build shows as one level, so the widgets that compare a condition's
  colour with their own act as in the preview.
- RGB565 image pixels go through the same mapping when they are loaded, from a
  64 K table that external RAM reserves at start and fills on demand, so an
  image and a fill of one colour look the same; alpha-only images take the
  corrected white. Without room for the table the board stays uncorrected.
- The `modules` document, and with it every LED colour, is untouched, and the
  stored document and `@PR:GET` keep the authored sRGB.

## Consequences

- Measured through the firmware, 66 colours land 2.3 ΔE2000 from the preview on
  average (1.9 for greys, bound by the RGB565 levels); the saturated reds, blues
  and magentas the panel cannot show land on the nearest it can, up to about 6.
  White gives up about a third of its luminance to reach D65.
- Rendering costs nothing more: on the seventeen bench patterns, with LVGL moved
  to the same cache position, render time moved +0.45 % on average and fps did
  not move. A colour costs a 28 µs search. Parsing remembers the first 64 it
  meets, so an `APPLY` of a 160 KB dashboard takes 15 ms longer. An image pays
  the search once per new colour after a start, 1.8 s for one that holds every
  RGB565 colour, and then 4.5 ms per 64 K pixels.
- Ramps and blends mix corrected colours, so their middles are approximate. In
  a 24-bit build, images keep RGB565 levels, so an image and a fill of one
  colour can differ by one RGB565 step.
- The profile comes from one unit, and other panels of the model may differ.
  Measuring a panel again needs a build whose driver names no profile. Guition's
  New_Panel display, on boards sold since 2026, has other glass and another
  gamma table, so the driver names none for it (ADR 0048). The boot splash and
  the safe-mode screen keep their built-in colours.
- A colour field added to the schema is corrected without a code change; a board
  without a profile behaves as before.
