# ADR 0026: UI Memory in External RAM and the ESP32-S3 Cache Budget

Status: Accepted. Changes what bounds the caps of
[ADR 0013](0013-generated-configuration-contract.md), removes the internal-RAM
ceiling the font registry of [ADR 0010](0010-uploaded-font-assets.md) ran into,
and adds a debug-only reply to the control protocol of
[ADR 0006](0006-simhub-custom-serial-line-protocol.md). The memory findings
stand; the frame-time figures below are superseded — they were measured under
the direct-mode buffering
[ADR 0027](0027-partial-render-buffers-and-unsynchronized-scan-out.md)
replaced, and with the full debug overlay drawn over the widgets under test,
which ADR 0027 found inflating every small-display figure. They were also taken
with the LVGL task sleeping 8 ms rather than the product's 16, a divergence
[ADR 0028](0028-debug-build-and-debug-application-boundary.md) removed, so they
must be re-measured before being compared with anything. Current frame costs
are in [runtime-performance.md](../runtime-performance.md).

## Context

The contract's bounded caps were set against an assumption nobody had measured:
that internal RAM is what a dashboard spends, and that a wider cap is therefore
a decision about memory. The assumption was wrong in both directions.

Measurement was the first problem — the figures existed only on the debug
overlay, on the panel, which is unreadable while the panel is full of the
widgets under test. `@PR:DIAG` answers the same snapshot on the link, with both
heaps read at the moment of the request, so a host can apply a document and read
what it cost. Everything below was measured that way, on a T-Display-S3, a
Guition ESP32-4848S040 and a Guition JC1060P470C.

What the measurements said:

- **Widgets are cheap.** Marginal internal RAM per widget is 460 B for a text,
  173 B for a shape, 365 B for a bar, 545 B for an arc, 1,285 B for an eight
  segment indicator — identical on both chips, because they are the same LVGL
  objects. A dashboard with every pool at its cap costs about 40 KB.
- **Fonts were not.** Every distinct `(family, size_px)` pair cost 5.4 KB of
  internal RAM. On the T-Display-S3 the free internal heap fell linearly to
  32 KB at twenty-four sizes and then stopped falling: allocations were failing,
  glyph caching quietly stopped, and firmware still answered `@PR:OK:APPLIED`.
  The contract's `kMaximumFonts` was 134 at the time — 724 KB — so the cap was
  never a bound on anything the hardware could actually do; the platform now
  derives it from `maximum_font_requests()` in `dashboard_fonts.hpp`.
- **What a redraw costs tracks the areas a frame draws, not the widgets it
  holds.** It does not move with a widget's box (3,677 / 3,818 / 3,823 µs for
  boxes of 840 / 3,360 / 13,600 px), because a readout invalidates its text
  rather than its box; a widget nothing updates is nearly free. The ESP32-S3
  spent 3,820 µs per changing widget against the ESP32-P4's 450. The full cost
  model — a large fixed amount per drawn area, a per-pixel term, and every
  on-screen object walked once per area — is under Consequences below.

The ESP32-S3's share of that is dominated by instruction-cache misses rather
than by pixel work, which is why every cache-shaped change moved it and every
attempt to accelerate blending did not.

## Decision

**Every LVGL allocation is taken from external RAM.** `LV_USE_CUSTOM_MALLOC`
selects the allocator in `platform/dashboard/memory/src/lvgl_heap.cpp`, which
forwards to `heap_caps_malloc(MALLOC_CAP_SPIRAM)` and falls back to the internal
heap, the same fallback the glyph allocator of ADR 0010 already makes. Nothing a
driver hands to DMA passes through it: `esp_lvgl_port` allocates the display
draw buffers with explicit capabilities, and font draw buffers keep their own
handler.

**The ESP32-S3 is built for its instruction cache.** Its target profile raises
the caches from 16/32 KB to 32/64 KB, compiles for size rather than speed, and
places the translation units a frame runs through — the software blender, the
rect, border, label and glyph paths, the refresh loop, the style and text
lookups — in internal RAM through a linker fragment. That fragment buys ~20% of
the render time for ~62 KB of internal RAM, which the board has to spare once
LVGL's heap lives in external memory. The ESP32-P4 gets none of it: its L2
cache runs at 256 KB instead (ADR 0027), and `-Os` costs it 12%. Ten software-renderer sources are the exception to compiling for size:
`cmake/apply_lvgl_sw_patch.cmake` builds them with `-O2` on a size-optimised
build, for about 9 % of a heavy round frame; the six of them in the fragment
take 4.8 KB more internal RAM.

**LVGL's software renderer is patched for round shapes** on every board
(`lvgl-9.6.0-sw-round-shapes.patch`). On an RGB565 layer it writes the rows of
circles and rings straight into the buffer instead of building a mask row and
blending it, decides an arc's angle mask once per area side where the kept
region is convex, and skips a fill or border with a corner radius of 16 px or
more that an area lies fully inside of; for smaller corners the check cost the
ESP32-P4's text screens more than it saved. LVGL 9.6 narrows an arc to the box
of its own angles itself. Every pixel stays as LVGL drew it, including one of
LVGL's own habits the patch must keep: the angle mask can report full cover
after writing edge values, so a row is judged by its values.

**The T-Display's draw buffers are 40 lines** rather than 80, which is where the
worst-case frame stops improving.

## Consequences

Free internal RAM no longer moves with what is composed. It is a constant on
every board — measured 119 KB on the T-Display-S3, 177 KB on the Guition
ESP32-4848S040, 475 KB on the JC1060P470C — whatever the dashboard holds, and
32 distinct font sizes now cost zero bytes of it instead of 23 being a wall.
The font ceiling is gone in the only sense that matters: it is bounded by
external RAM, of which the smallest board has 7.4 MB free.

Render time per changing widget: **3,820 → 1,251 µs on the T-Display-S3** and
**3,242 → 823 µs on the Guition ESP32-4848S040**, with the render core at 8
changing widgets falling from 93% to 33%. The ESP32-P4 is unchanged at ~450 µs;
nothing tried moved it.

The round-shape patch and `-O2` together, on the Guition ESP32-4848S040 with
`round-dial-480`: **62 → 29 ms a frame (15.5 → 29 fps)** while its ring is
ramping and 12.7 → 7.9 ms below the ramp. Frame checksums matched the
unpatched build on nine screens, and on three with running timers every
24-row band matched. Built for the host, the patched and the original renderer
drew 400,000 random cases to the same bytes: fills, borders and arcs on random
backgrounds and clip areas, half of them arcs clipped across their edges and
centre row. That test, not the screens, found the two habits above. On the
JC1060P470C the patch lifts `round-twin-dial` from 40 to about 46 fps, 49 with
the ring arc's partial repaint, and leaves every other bench screen within
noise ([performance-baselines.md](../performance-baselines.md)).

**A cap is now a decision about frame time, not about memory.** Raising one
costs drawing time in proportion to how many of the widgets it admits actually
change, and nothing in internal RAM. That is the question to ask of the next
cap change, and `@PR:DIAG` is how to answer it.

What this does not fix is the shape of the cost itself, which later measurement
did explain. A frame draws areas, and one area costs a large fixed amount —
~734 µs on the ESP32-S3, ~509 µs on the ESP32-P4 — plus 93 ns and 13 ns per
invalidated pixel respectively, plus 11–26 µs for every object on the screen,
changed or not, walked once per area. On the ESP32-P4 the fixed part is ~85% of
a readout, which is why no pixel-shaped change ever moved it. Trading areas for
pixels does not help either: snapping invalidations out to a grid so neighbours
merge halves the area count and is slower on both boards. The lever that remains
is having fewer independently changing widgets — one text widget composing three
sources is one area where three widgets are three — and it belongs to whoever
authors the dashboard rather than to the firmware.

Timing inside LVGL's refresh then showed the two boards are limited by different
things: the ESP32-S3 spends 61% of an area in the software blender and 29% in
the object-tree walk, while the ESP32-P4 finishes drawing in 400 µs and waits
~8.6 ms for its panel. The S3 is CPU-bound and the P4 is display-bound, which is
why every ESP32-S3 setting above moved one board and none of them moved the
other. The figures are in [runtime-performance.md](../runtime-performance.md).

The first cap change decided that way raised the pools rather than the frame
budget, and broke the identity that had tied them to a screen. The per-type caps
were exactly the widgets one screen could reference, so a screen could hold the
whole pool and the pool could hold no more than a screen; what an author ran out
of was never the total but the mix — 24 images against 96 texts, whatever the
dashboard was actually made of. They are now dashboard-wide pools that outsize
any one screen: text 96 → 160, shape 64 → 96, image 24 → 64, bar 32 → 48, arc
16 → 24, indicator 8 → 12, graph 4 → 6, slot 8 → 12, together 422 against the
255 references a screen can address — the uint8 that counts them, and the only
hard wall left. A payload carries around 370 widgets at the ~350 bytes one
measures, so the document is the tighter bound of the two.

It cost what this ADR predicted it would: external RAM and nothing else.
`.ext_ram.bss` went from 165,208 to 271,824 bytes and `ApplicationConfiguration`,
of which two live in the PSRAM arena, from 156,000 to 255,360 — about 305 KB of
the 7 MB free. Flash did not move; the pools are BSS. Internal RAM moved only
where the caps reach a stack: validation's scratch is indexed by the shape and
slot-page caps, so the main task went to 5,120 bytes and the configuration
control task to 6,144. A second raise, when the Endurance starters held 155 texts,
every slot and 98 % of the payload, took text to 240, slot to 16 and the payload
to 160 KB: on the ESP32-P4 `.ext_ram.bss` went from 390,784 to 489,216 bytes,
each `ApplicationConfiguration` grew by about 75 KB and the payload buffers by
128 KB together, some 380 KB of external RAM. Static internal RAM did not move on
any board; the main task went to 5,632 bytes for the larger slot page table. A
third, when Endurance gained a map screen that repeats its centre column and its
bottom row, took slot to 24, shape to 128, indicator to 16 and the payload to
192 KB, 110 of the configuration partition's 127 pages: on the ESP32-P4
`.ext_ram.bss` went from 489,216 to 522,256 bytes and the payload buffers grew by
another 128 KB. Validation's scratch grew by 1,536 bytes, so the main task went to
7,168 bytes and the configuration control task to 9,728, the one rise in static
internal RAM on every board. Since then that scratch lives in the configuration
memory in external RAM, so a cap no longer reaches a task stack: the control
task's deepest measured use fell from 7,276 to 2,748 bytes for a stored dashboard
and 4,540 for the deepest `APPLY` of the bench patterns, so its stack is now
7,680. The command line, the command and the stored record share one
payload-sized buffer, and fonts, images and firmware upload on one task, which
left every board 14 KB more internal RAM and about 380 KB more external RAM.

What external RAM is left bounds the fonts and images: at startup a board copies
every face of its package and decodes every image the dashboard draws into it.
The configurator stops a save when the fonts and images the board would hold
pass `assetMemoryBytes` in the board profile and more than it holds now: the
lowest free external RAM with the board's own dashboard, plus the fonts and
images that dashboard holds, less a margin for the glyph caches and objects of a
heavier one. On the ESP32-4848S040 that is 2,367 + 400 − about 590 = 2,175 KB;
the JC1060P470C's lowest was 22.5 MB and its figure is 20 MB; the other boards
have none yet. Firmware 0.4.1 has about 380 KB less free, so a 4848 still on it
keeps a margin of about 200 KB.

What the pools do not buy is a screen filled to 255. Widgets spread across four
screens are free while three of them are not shown, but every object on the
screen that is shown is walked once per drawn area, so a single dense screen
still meets the frame long before it meets a cap. The pools decide what an
author may build; the frame decides what renders at 60 fps, and the two are
deliberately not the same number.

**`LV_OBJ_STYLE_CACHE` is on for the ESP32-P4 only.** It was rejected on an
ESP32-S3 reading — 1,854 → 2,016 µs, worse — and that still holds for the S3
boards, which do not set it. `sdkconfig.defaults.esp32p4` enables it; the ADR
records the current setting rather than the older blanket rejection.

## Alternatives measured and rejected

- **Two software draw units** (`LV_DRAW_SW_DRAW_UNIT_CNT=2`, which needs
  `LV_OS_FREERTOS`): 1,877 → 2,138 µs on the ESP32-S3 and no change on the
  ESP32-P4, for 18–28 KB of thread stacks. One core does sit idle, but there is
  no bulk pixel work to give it.
- **Espressif's SIMD blenders**: `esp_lvgl_port` compiles them only for LVGL
  9.1.x and this project is on 9.5, and the cost is not blending anyway.
- **PPA for fills**: LVGL 9.5 exposes the accelerator for image draw only, which
  is already enabled.
- **`LV_ATTRIBUTE_FAST_MEM_USE_IRAM`**: LVGL 9.5 does not build with it
  (`section '.iram1.8' conflicts with previous '.iram1.4'`), hence the linker
  fragment.
- **Screen slides animated from snapshots** rather than from the screens
  themselves, so that the ESP32-P4's image accelerator would carry the moving
  frames: 36.1 ms a frame against LVGL's own 30.7. Two full-screen pictures are
  more pixels than the two partial screens LVGL actually draws, and the
  snapshots cost a full render each on top. See
  [runtime-performance.md](../runtime-performance.md).
- **Flash QIO instead of DIO, cache line 32 → 64 B, cache wrap mode, a 16 ms
  refresh period**: all within noise. QIO measured 5 % on the
  heaviest round-dial frame later, still too little for a bootloader that only
  a cable can replace.
- **Smaller ring repaint pieces and a 64-entry invalidation buffer**: every
  piece size from 6° to 25°, uniform or only near the diagonals, drew
  `round-dial-480` slower than 30° pieces, because every redrawn area costs
  about 1 ms of object and task work whatever its size.
- **`GET` reading the stored document back from NVS** instead of keeping a copy,
  for 225 KB of external RAM: NVS reads stall the cache of both cores, so on the
  ESP32-P4 a `GET` of a 159 KB dashboard took 0.72 s instead of 0.35 and drew 50
  frames instead of 59 in that second.
