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
| `lsr-ddu` main | 58.9 | 2.01 | 22.9–24.0 | 58.9 |
| `lsr-ddu` times | 9.9–10.7 | 1.17 | 8.6 | 10.6 |
| `lsr-ddu` fuel | 9.9 | 1.70 | 15.3–17.6 | 10.0 |
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
| `lsr-ddu` main | 58.9 | 2.00 | 23.4 | 58.9 |
| `lsr-ddu` times | 10.6 | 1.15 | 8.7 | 10.6 |
| `lsr-ddu` fuel | 10.0 | 1.69 | 15.1–17.6 | 10.0 |
| `round-twin-dial` dial | 48.3 | 10.40 | 28.7–29.9 | 48.6 |
| `race-ddu` race | 58.8 | 4.68 | 22.6–24.0 | 58.8 |

The order no longer decides the mode. Forward and reversed agree within the
noise on every document but `full_screen_bar` (34–36 fps forward, 42 reversed),
and documents applied after the ones that used to trap them run in their faster
mode: `all_widgets` after `graphs_6` at 39.7 fps instead of 29.5, `text_16`
after `full_screen_bar` in 8.3 ms at 56% of core 1 instead of 15 ms at 92%, and
the `lsr-ddu` main screen after `full_screen_bar` at 58.9 from the start
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
| `lsr-ddu` main | 58.9 | 2.01 | 23.4 | 58.9 | 2.07 |
| `lsr-ddu` times | 10.6 | 1.14 | 8.7 | 10.7 | 1.13 |
| `lsr-ddu` fuel | 10.0 | 1.69 | 15.1 | 9.8 | 1.83 |
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
every run; the `lsr-ddu` main screen, applied after `full_screen_bar`, needed a
few seconds to leave the whole-frame mode.

Against the settle-gate figures of ADR 0027 (September): `text_32` 55 → 49,
`text_32_plain` 57 → 51, `bars_24` 51 → 48. 5b4df56 reads the same, both text
screens already run their faster mode, `bars_24` reaches 49 in its other one,
and `text_32` without the full-row text repaint of 0f27e7f reads 47, so the
gap is older than this change and not that commit. Those figures used
`roboto_black`, which the board no longer holds; the gap is unexplained, and
this entry is the baseline instead.
