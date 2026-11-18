# Performance baselines

What each display board measured on one fixed bench, kept so that a change can
be checked against the last good run. Compare a new run with the newest entry
for the same board: a document slower by more than the noise below is a
regression, explained or fixed before the change lands. When a change makes a
board faster, add a new entry above the old one and keep the old one. The
measurement history of a single decision stays in its ADR (0026, 0027, 0032).

## How an entry is measured

- A debug build of the board's default profile, `sdkconfig.defaults.debug`
  appended, drawing the FPS chip it draws by default.
- The debugger's sixteen bench patterns, built by `buildBenchDashboard` at the
  panel's resolution with a font family the board holds, fed the fourteen
  `bench-signals.ts` waveforms at 60 Hz. Bundled templates are cut to one
  screen and fed only their own bindings, each a slow sine sent at its catalog
  rate (`fast` 60 Hz, `normal` 10, `slow` and `changes` 1).
- Some templates named below have left
  `configurator/src/main/templates/bundled/`. Take them from commit `2ca80d1`,
  the last one that holds them. `ddu-1024` is its 1024 x 600 template with the
  screens `main`, `times` and `fuel`. The `round-dial-480` figures below measure
  the design of that commit too; the template has been redrawn since.
- Each document is applied with `@PR:APPLY`, 3 s are discarded, and 6 s of
  `@PR:DIAG` replies, four a second, are averaged. The battery runs twice, in
  the order of the table, without a reboot.
- `fps` and `render_us` are compared. A screen whose values change slower than
  the panel refreshes reports fewer frames without being late
  ([runtime-performance.md](runtime-performance.md#measurements)), which is why
  two template screens read 10 fps.

Between two runs of one build the noise is about ±0.3 fps and ±2% render on a
document that holds the panel rate, and ±1 fps below it.

## Guition JC1060P470C (ESP32-P4)

### 2026-11-17 — a four-second gate and no pacing before a measurement

The tree of the entry below with the settle gate timed in seconds instead of
240 frames, and frames not held for pacing until the new screen is measured
(ADR 0027). Same bench; the battery ran forward and reversed, twice each, and
*before* is the entry below.

| Document | fps | render ms | latency ms | before fps |
| --- | ---: | ---: | ---: | ---: |
| `text_only` | 58.9 | 1.95 | 23.9 | 58.9 |
| `text_16` | 58.9 | 8.31 | 24.7 | 58.9 |
| `text_32` | 48.9 | 13.84 | 28.3 | 48.9 |
| `text_32_plain` | 51.1 | 12.88 | 27.2 | 51.1 |
| `text_32_shapes` | 42.5 | 15.88 | 30.9–32.0 | 42.0–43.0 |
| `text_64` | 28.3 | 31.07 | 45.5 | 28.7 |
| `huge_text_4` | 58.9 | 7.17 | 23.7–24.9 | 58.9 |
| `shapes_96` | 58.9 | 7.00 | 24.5 | 58.9 |
| `arcs_12` | 58.8 | 5.51 | — | 58.9 |
| `bars_24` | 47.3 | 11.75 | — | 47.7 |
| `full_screen_bar` | 34.4–42.5 | 18.2–18.7 | 31.0–36.3 | 34.1–41.9 |
| `indicators_12` | 53.6–55.8 | 8.6–9.0 | — | 52.0–54.0 |
| `graphs_6` | 26.8 | 27.0–27.5 | — | 23.7 |
| `sprites_24` | 55.1 | 11.56 | 26.2 | 54.7–55.4 |
| `nested_containers` | 55.2 | 11.21 | 26.0 | 56.0 |
| `all_widgets` | 42.8 | 12.60 | 29.9 | 43.2 |
| `ddu-1024` main | 58.9 | 2.01 | 22.9–24.0 | 58.9 |
| `ddu-1024` times | 9.9–10.7 | 1.17 | 8.6 | 10.6 |
| `ddu-1024` fuel | 9.9 | 1.70 | 15.3–17.6 | 10.0 |
| `round-twin-dial` dial | 48.5 | 10.30 | 28.2–29.3 | 48.3 |
| `race-ddu` race | 58.8 | 4.68 | 23.6 | 58.8 |

Faster: `graphs_6` 23.7 → 26.8 fps within the battery's window, because it is
measured four seconds after it is applied instead of after 240 of its own
frames; over 30 s it holds 22.9 fps for 6 s and 29.5 from then on (12 s
before). `indicators_12` 52–54 → 54–56: in the 30 s window, applied after
`full_screen_bar`, its first six seconds read 55 fps where holding frames to
the previous screen's cost had given 36. `full_screen_bar` still depends on
the order (34–37 forward, 40–42 reversed); its two modes cost nearly the same
to the economics. Every other document is within the noise of the entry below.

### 2026-11-17 — every composition restarts the mode choice

The tree of the entry below plus the mode-choice restart of ADR 0027's
settle-gate amendment, on the same bench and conditions. The battery ran
forward and reversed, twice each; a range is the spread of the four runs, and
*before* is the entry below.

| Document | fps | render ms | latency ms | before fps |
| --- | ---: | ---: | ---: | ---: |
| `text_only` | 58.9 | 1.95 | 23.0–24.3 | 58.9 |
| `text_16` | 58.9 | 8.38 | 24.5 | 58.9 |
| `text_32` | 48.9 | 13.80 | 28.5 | 49.2 |
| `text_32_plain` | 51.1 | 12.85 | 27.4 | 51.2 |
| `text_32_shapes` | 42.0–43.0 | 15.7–16.1 | 31.7 | 42.9 |
| `text_64` | 28.7 | 30.73 | 45.7 | 28.6 |
| `huge_text_4` | 58.9 | 7.24 | 24.5 | 58.9 |
| `shapes_96` | 58.9 | 7.02 | 24.2 | 58.8 |
| `arcs_12` | 58.9 | 5.36 | — | 58.9 |
| `bars_24` | 47.7 | 11.63 | — | 47.8 |
| `full_screen_bar` | 34.1–41.9 | 17.1–19.0 | 30.6–37.2 | 33.7–36.2 |
| `indicators_12` | 52.0–54.0 | 8.6–9.0 | — | 53.1–54.0 |
| `graphs_6` | 23.7 | 29.57 | — | 23.7–29.4 |
| `sprites_24` | 54.7–55.4 | 11.58 | 26.4 | 38.5–55.5 |
| `nested_containers` | 56.0 | 11.09 | 25.7 | 55.9 |
| `all_widgets` | 43.2 | 12.40 | 29.5 | 43.2 |
| `ddu-1024` main | 58.9 | 2.00 | 23.4 | 58.9 |
| `ddu-1024` times | 10.6 | 1.15 | 8.7 | 10.6 |
| `ddu-1024` fuel | 10.0 | 1.69 | 15.1–17.6 | 10.0 |
| `round-twin-dial` dial | 48.3 | 10.40 | 28.7–29.9 | 48.6 |
| `race-ddu` race | 58.8 | 4.68 | 22.6–24.0 | 58.8 |

The order no longer decides the mode. Forward and reversed agree within the
noise on every document but `full_screen_bar` (34–36 fps forward, 42 reversed),
and documents applied after the ones that used to trap them run in their faster
mode: `all_widgets` after `graphs_6` at 39.7 fps instead of 29.5, `text_16`
after `full_screen_bar` in 8.3 ms at 56% of core 1 instead of 15 ms at 92%, and
the `ddu-1024` main screen after `full_screen_bar` at 58.9 from the start
instead of 51. `sprites_24` reads 55 in every run instead of 38–55.

A screen that redraws half the panel nearly every frame waits the gate's 240
frames before anything is measured, so the battery's window mostly sees it in
reconciled mode. Measured over 30 s after `@PR:APPLY`: `graphs_6` holds 23.5
fps for 12 s and 29.4 from then on. `full_screen_bar` settles near 40 and
`indicators_12` near 53, short of what the other mode shows forced (43 and 59),
because the cost the economics compare leaves out the flush worker's copy tail,
as before this change.

Text screens draw within the spread of today's builds that do not change text
drawing (`text_16` 8.07–8.37 ms on them, 8.38 here) at the same frame rate.

### 2026-11-17 — working tree on 5b4df56

The LVGL round-shapes patch and the ring arc's partial repaint. 1024×600
RGB565, `FULL_STRIPS` (the default), `roboto_bold`, no image named, so
`sprites_24` draws its text grid. *Before* is the same bench on 5b4df56; a
range is the spread of the two runs.

| Document | fps | render ms | latency ms | before fps | before render ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `text_only` | 58.9 | 1.95 | 23.2 | 58.9 | 1.92 |
| `text_16` | 58.9 | 8.13 | 24.5 | 58.8 | 8.13 |
| `text_32` | 49.2 | 13.70 | 28.4 | 49.5 | 13.67 |
| `text_32_plain` | 51.2 | 12.80 | 27.4 | 51.2 | 12.80 |
| `text_32_shapes` | 42.9 | 15.75 | 31.8 | 43.2 | 15.56 |
| `text_64` | 28.6 | 30.83 | 45.0 | 26.9 | 32.94 |
| `huge_text_4` | 58.9 | 7.18 | 24.3 | 58.9 | 7.08 |
| `shapes_96` | 58.8 | 7.00 | 24.9 | 58.9 | 6.99 |
| `arcs_12` | 58.9 | 5.44 | — | 58.9 | 6.37 |
| `bars_24` | 47.8 | 11.58 | — | 47.0–47.7 | 12.04 |
| `full_screen_bar` | 33.7–36.2 | 17.1–18.9 | 35.4–37.0 | 35.8 | 17.7–18.2 |
| `indicators_12` | 53.1–54.0 | 8.64 | — | 52.5–54.8 | 9.23 |
| `graphs_6` | 23.7–29.4 | 25.0–29.5 | — | 26.9–29.1 | 25.4–27.5 |
| `sprites_24` | 38.5–55.5 | 11.5–19.8 | 26.2–34.8 | 49.0–55.3 | 11.6–13.5 |
| `nested_containers` | 55.9 | 11.04 | 25.5 | 56.2 | 11.06 |
| `all_widgets` | 43.2 | 12.52 | 30.0 | 42.9 | 12.65 |
| `ddu-1024` main | 58.9 | 2.01 | 23.4 | 58.9 | 2.07 |
| `ddu-1024` times | 10.6 | 1.14 | 8.7 | 10.7 | 1.13 |
| `ddu-1024` fuel | 10.0 | 1.69 | 15.1 | 9.8 | 1.83 |
| `round-twin-dial` dial | 48.6 | 10.14 | 28.3 | 39.5–40.5 | 21.5–22.7 |
| `race-ddu` race | 58.8 | 4.67 | 23.2 | 58.7 | 4.80 |

Latency is blank where the screen holds no text readout.

Against 5b4df56, faster: `round-twin-dial` 40 → 48.6 fps (render 22 → 10 ms;
about 46 from the patch alone), `text_64` 26.9 → 28.6 fps, `arcs_12` render 6.4
→ 5.4 ms, `bars_24` and `indicators_12` render 4–6% less. Nothing is slower
beyond the noise; the text screens draw 1–2% longer at the same frame rate.

Five documents depend on the screen before them, which is why their rows are
ranges. The full-strips economics keep both modes' costs across `@PR:APPLY`,
and a mode whose old cost is above the probe budget is never measured again, so
a new dashboard can keep the slower mode for as long as its own cost holds
steady. Forced through a test-only knob on 5b4df56 with the patch, the two
modes (reconciled rows / whole frame) give `full_screen_bar` 35 / 43 fps,
`indicators_12` 55 / 59, `graphs_6` 23 / 29, `sprites_24` 55 / 45,
`all_widgets` 40 / 36, and `all_widgets` applied after `graphs_6` stays at
29.5. The other documents ended in a mode within 2 fps of the faster one in
every run; the `ddu-1024` main screen, applied after `full_screen_bar`, needed a
few seconds to leave the whole-frame mode.

Against the settle-gate figures of ADR 0027 (September): `text_32` 55 → 49,
`text_32_plain` 57 → 51, `bars_24` 51 → 48. 5b4df56 reads the same, both text
screens already run their faster mode, `bars_24` reaches 49 in its other one,
and `text_32` without the full-row text repaint of 0f27e7f reads 47, so the
gap is older than this change and not that commit. Those figures used
`roboto_black`, which the board no longer holds; the gap is unexplained, and
this entry is the baseline instead.

## Guition ESP32-4848S040 (ESP32-S3)

### 2026-11-18 — code and read-only data in PSRAM

The first entry for this board. 480×480 RGB565, the tear-free strip mode at
17.1 MHz, `roboto_bold`, no image named, so `sprites_24` draws its text grid;
the five bundled templates are cut to their screens. 7f74bef with
`CONFIG_SPIRAM_XIP_FROM_PSRAM` (ADR 0027); *before* is 7f74bef without it. A
range is the spread of the two runs.

| Document | fps | render ms | latency ms | before fps | before render ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `text_only` | 57.3–59.0 | 2.68–2.73 | 11.2–12.0 | 57.1–58.0 | 3.05–3.08 |
| `text_16` | 60.4–60.5 | 9.16–9.18 | 23.1–23.3 | 60.4 | 9.58–9.67 |
| `text_32` | 40.7–40.9 | 17.55–17.66 | 33.3–34.0 | 37.9–38.1 | 18.52–18.73 |
| `text_32_plain` | 43.2 | 16.06–16.11 | 32.1–32.2 | 40.3–40.4 | 16.99–17.26 |
| `text_32_shapes` | 28.1–28.4 | 24.90–25.01 | 45.8–47.1 | 27.1–27.2 | 25.55–25.79 |
| `text_64` | 13.3–13.6 | 60.88–62.54 | 96.3–101.3 | 13.2 | 61.74–61.95 |
| `huge_text_4` | 60.0–60.1 | 7.34–7.40 | 23.2 | 59.0–59.5 | 7.34–7.66 |
| `shapes_96` | 58.6–58.7 | 9.74–9.77 | 15.9 | 56.9–57.2 | 10.14–10.22 |
| `arcs_12` | 60.4 | 6.89–6.95 | — | 60.2–60.3 | 8.05–8.17 |
| `bars_24` | 40.0–40.2 | 12.21–12.40 | — | 36.6–36.8 | 12.95–13.36 |
| `full_screen_bar` | 44.5–44.9 | 12.61–13.35 | 28.0–28.2 | 41.3–42.0 | 13.49–13.64 |
| `indicators_12` | 30.8–31.3 | 12.71–14.02 | — | 29.6–29.8 | 14.64–14.77 |
| `graphs_6` | 25.6–25.7 | 29.27–29.31 | — | 23.0–23.1 | 31.53–31.64 |
| `sprites_24` | 53.0–53.2 | 12.82–12.90 | 26.1–26.4 | 48.7–49.2 | 13.67–13.98 |
| `nested_containers` | 44.4–44.7 | 15.59–15.81 | 30.5–31.0 | 42.4–42.6 | 16.04–16.09 |
| `all_widgets` | 48.5–50.0 | 12.62–13.52 | 26.1–26.6 | 38.5–38.6 | 16.44–16.49 |
| `guition-reference` | 60.3 | 6.75–6.94 | 21.4 | 57.5–59.3 | 7.98–8.55 |
| `guition-screens-and-slots` drive | 60.4 | 5.00–5.16 | 20.1–21.4 | 59.4–60.1 | 4.68–5.22 |
| `guition-screens-and-slots` lap | 60.4–60.5 | 2.84–2.86 | 24.8–26.0 | 60.3–60.4 | 3.24–3.30 |
| `round-dial-480` dial | 46.6–53.5 | 12.46–17.45 | 29.2–36.3 | 33.8–34.6 | 27.64–27.66 |
| `round-dial-480` data | 12.2–12.8 | 3.26–3.32 | 6.3–6.4 | 11.5–11.8 | 3.77–3.78 |
| `round-screen-480` | 56.8–56.9 | 10.63–11.47 | 26.3–26.9 | 55.3–59.7 | 10.58–12.40 |
| `tyre-corners-480` | 1.8–2.0 | 14.53–14.60 | 27.6–32.7 | 1.8 | 14.94–15.24 |

Latency is `lat_us`, which on this board stops where LVGL finishes the frame,
not at the glass (ADR 0027), and is blank where the screen holds no text
readout. `tyre-corners-480` reads 2 fps because its bindings are all `slow`.

Faster with the code in PSRAM: `round-dial-480` dial 34 → 47–54 fps (render
27.6 → 12.5–17.5 ms), `all_widgets` 38.5 → 49, `graphs_6`, `bars_24`,
`sprites_24`, `text_32` and `text_32_plain` 7–11 %, every render 0–21 % shorter
except the spread of `round-screen-480` and `guition-screens-and-slots` drive.
Nothing is slower beyond the noise. On the light screens that hold 60 fps,
`lat_us` reads up to 1.5 ms more (`guition-screens-and-slots` drive 15–19 →
20–21 ms), within the light-screen scheduling, which starts a frame as late as
it can still make its refresh. The copy costs about 0.7 MB of PSRAM: the
lowest free external RAM read 3.04 MB against 3.74 MB, internal RAM 45.4 KB
against 46.7 KB.

## LilyGO T-Display-S3 (ESP32-S3)

### 2026-11-18 — 7f74bef

The first entry for this board. 320×170 RGB565 over the 8-bit parallel bus,
`roboto_bold`, no image named, so `sprites_24` draws its text grid; the four
bundled templates are cut to their screens. A range is the spread of the two
runs.

| Document | fps | render ms | latency ms |
| --- | ---: | ---: | ---: |
| `text_only` | 61.0–61.2 | 2.23–2.26 | 4.1 |
| `text_16` | 63.6–65.5 | 5.67–5.86 | 9.2 |
| `text_32` | 49.0–49.3 | 13.91–13.97 | 28.6–28.8 |
| `text_32_plain` | 52.9–53.0 | 12.74–12.76 | 26.9–27.1 |
| `text_32_shapes` | 36.9 | 18.10–18.12 | 34.9–35.6 |
| `text_64` | 25.7–25.8 | 28.69–28.89 | 50.0–50.1 |
| `huge_text_4` | 60.8–62.2 | 2.09–2.13 | 3.6 |
| `shapes_96` | 60.3–60.7 | 1.73–1.74 | 3.5 |
| `arcs_12` | 66.0–68.8 | 5.32–5.51 | — |
| `bars_24` | 63.0–63.7 | 6.01–6.08 | — |
| `full_screen_bar` | 63.0–63.5 | 4.07–4.14 | 6.7–6.8 |
| `indicators_12` | 53.8–54.5 | 7.27–7.38 | — |
| `graphs_6` | 62.8–63.0 | 8.45–8.48 | — |
| `sprites_24` | 61.5–63.1 | 9.08–9.32 | 13.8 |
| `nested_containers` | 53.0–53.2 | 12.76–12.80 | 26.8–27.0 |
| `all_widgets` | 110.2–111.3 | 4.28–4.29 | 11.3 |
| `flag-strip` | 189.6–190.5 | 1.13–1.20 | 4.9–5.2 |
| `fuel-card` fuel | 1.4–1.7 | 2.39–2.81 | 5.1–5.8 |
| `fuel-card` stint | 4.3–4.5 | 1.93–1.97 | 4.1 |
| `lilygo-lap` | 6.0–7.1 | 2.24–2.43 | 124.3–148.5 |
| `rallye-stage` stage | 188.5–189.0 | 1.58–1.64 | 4.8–5.0 |
| `rallye-stage` detail | 12.0–15.7 | 2.82–2.92 | 5.1–5.3 |

The panel keeps its own frame memory and frames are not paced to a refresh, so
under a 60 Hz feed a screen can draw more than 60 frames a second
(`flag-strip` 190, `all_widgets` 111). Latency is
blank where the screen holds no text readout. `lilygo-lap` is fed its flag
fields too, and a flag at 1 raises a full-screen flag page that blinks every
125–250 ms and hides the lap time, which is what its row measures; with the
flags at 0 the lap time draws about 200 frames a second through the
`lap_timer` modifier (core 1 at 68 %), the same as 0.3.1, and 61 frames at
4.3 ms without it. The lowest free internal RAM read 90.2 KB, external RAM
5.4 MB.
