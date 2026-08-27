# ADR 0027: Partial Render Buffers and Unsynchronized Scan-Out

Status: Accepted. Changes the display buffering the drivers of the Guition
ESP32-4848S040 and the Guition JC1060P470C hand to the LVGL port, raises the
4848S040's pixel clock, and adds a second `esp_lvgl_port` patch beside the one
[ADR 0026](0026-ui-memory-in-external-ram.md)-era work introduced for the DSI
cache-safe callback.

## Context

Both RGB and DSI boards rendered in direct mode with `avoid_tearing`: LVGL drew
into the panel's own frame buffers and every flush blocked until the panel
finished scanning the frame out. That bought tear-free frames at the price of
latency and frame rate, measured end to end (telemetry commit →
`LV_EVENT_REFR_READY`) with the debug `lat_us` probe over `@SC:DIAG`:

- The 4848S040's 10 MHz pixel clock scans 480×480 with its porches at 35.2 Hz,
  so the board could not exceed 35 fps whatever the CPU did, every flush waited
  up to a whole 28 ms scan, and a dashboard of eight changing readouts at 60 Hz
  telemetry showed values 29–36 ms after they arrived.
- The JC1060P470C's DSI panel scans at 60 Hz, and the flush wait averaged half
  a period; under 60 Hz telemetry the pipeline queued to 23–25 ms of latency.

Partial mode — LVGL rendering 40/60-line strips in internal DMA RAM and
`draw_bitmap` copying them into the scanning frame buffer immediately — was
measured on both boards: latency halved on the 4848S040 (29 → 15 ms) and
dropped to 6–12 ms on the JC1060P470C at a full 60 fps, and the render itself
got faster because blending into an internal-RAM strip beats blending into the
PSRAM frame buffer. Raising the 4848S040's pixel clock to 16 MHz (56.4 Hz scan,
with 480×10 px bounce buffers to keep the PSRAM-fed panel stable) lifted its
frame-rate ceiling from 35 to 60+ fps. The T-Display-S3's i80 panel never
waited for scan-out, so it is unchanged.

## Decision

- Both boards hand the port partial buffers (two strips in internal DMA RAM),
  `avoid_tearing = false`, `direct_mode = false`. The 4848S040 runs its pixel
  clock at 16 MHz with 480×10 px bounce buffers.
- Tearing is accepted for widget updates: a strip lands in the frame buffer
  mid-scan, and for numeric readouts the artifact is a one-frame horizontal
  seam inside a glyph, judged worth 14–17 ms of latency on every value the
  dashboard shows. A screen change is the case it is not acceptable for — a
  slide invalidates the whole screen every frame and the seams read as the
  image breaking apart — so the navigation controller switches the display to
  tear-free rendering into the panel frame buffers for the duration of a
  transition (`lvgl_port_disp_set_tear_free`, added by the same port patch)
  and back to partial strips one refresh after the new screen has settled.
  DSI uses true direct mode, handed the buffer the panel is not scanning
  first — or the first transition frame paints in plain sight. RGB cannot
  render into its PSRAM frame buffers at all: blending is a read-modify-write
  through the cache, and with the 16 MHz bounce-buffer scan-out on the same
  bus the panel underruns — rows visibly sliding down the screen (direct and
  full mode both failed on the bench). So RGB keeps LVGL in partial mode, with
  the same internal-RAM strips and the same PSRAM traffic as the resting
  state, and the port's flush redirects each strip into the hidden frame
  buffer; the last strip of a frame that covered the whole screen swaps the
  buffers at the frame boundary. A frame that covered less does not swap — its
  strips wait in the hidden buffer for the next full animation frame, so a
  stray widget-only refresh cannot swap ghost content in. At rest the switch
  costs nothing; verified tear-free on both boards.
- The JC1060P470C's DPI panel copies each strip with DMA2D
  (`esp_lcd_dpi_panel_enable_dma2d`, called once when the panel is created).
  Without it `esp_lcd_panel_draw_bitmap` falls back to a per-line `memcpy`
  that not only spends a core but competes for the same PSRAM the renderer is
  blending into; handing the copy to the 2D engine lifted every dashboard
  pattern by 33-92% (text_16 61->106 fps, shapes_96 57->107, all_widgets
  57->96) and dropped *render* time by half on top of that, because the
  bandwidth the copy was taking went back to the blender. It is the largest
  single lever measured on this board.
- On the JC1060P470C the flush itself leaves the render core: the same
  `esp_lvgl_port` patch adds a small queue and a worker task pinned to core 0
  that runs `esp_lcd_panel_draw_bitmap`, waits out the transfer and completes
  the flush, so the LVGL task hands a strip over and immediately renders the
  next one into the second buffer. Draw-task profiling attributed 27–58% of
  the render core to the flush; moving it lifted every measured dashboard
  pattern by 13–36% (text_16 50→68 fps, text_32 30→39, bars_24 38→48) and cut
  value latency ~20%. A mode switch drains the queue first, so a transition
  never races an in-flight strip.
- The ESP32-P4 build also runs its flash in QIO instead of DIO and its L2
  cache at 256 KB instead of 128 (`sdkconfig.defaults.esp32p4`), together
  +38–47% before the flush move — the render core was starving on code and
  frame-buffer fetch, not on arithmetic. The 256 KB cache costs 128 KB of
  internal RAM, paid for by shrinking the render strips from 60 to 40 lines
  (measured free: −0–2%); with 60-line strips the second LVGL buffer no
  longer fits and startup lands in safe mode.
- `esp_lvgl_port` is patched on the ESP32-P4
  (`patches/esp-lvgl-port-2.8.0-dsi-cache-safe-flush.patch`, one combined file
  because overlapping split patches defeat the apply script's already-applied
  check). Upstream's DSI partial path defers
  `lv_disp_flush_ready` to the `on_color_trans_done` ISR, which under
  `CONFIG_LCD_DSI_ISR_CACHE_SAFE` must not reach flash-resident LVGL code or
  the PSRAM-resident display object. The patch mirrors the vsync path instead:
  the ISR only gives a semaphore held in internal RAM, and the flush callback
  waits on it and completes the flush from task context.
- What a debug build draws over the dashboard became a Kconfig choice
  (`SIMCORE_DEBUG_OVERLAY`: full panel / FPS figure / nothing, default FPS).
  The full statistics panel blends a semi-transparent block over the widgets
  beneath it, which distorted every small-display measurement this decision
  was almost made against — with it on screen the T-Display-S3 measured 48 fps
  where 61 is real. The FPS figure is an opaque chip LVGL draws without
  touching anything under it, and its label is set only when the digit changes.

## Consequences

- Latency (commit → panel accepted) at 60 Hz telemetry, eight readouts:
  T-Display-S3 ~7 ms, 4848S040 ~8.5 ms, JC1060P470C ~6 ms. Sixty fps holds to
  roughly sixteen concurrently changing readouts on each board.
- The cost model of [runtime-performance.md](../runtime-performance.md)
  changes shape on the two boards: flush is a strip copy (2–4 ms a frame)
  rather than a scan-out wait — and on the JC1060P470C the copy runs on the
  core-0 worker, so `flush_us` there reads a hand-off of a few hundred
  microseconds and the frame budget is almost entirely render time. Figures in that document measured under direct mode are marked as such.
- A flash write during a flush is safe on the P4 only because the ISR touches
  nothing outside IRAM and internal RAM; the patch must be reviewed if
  `esp_lvgl_port` is upgraded past 2.8.0~1 (the apply script fails the build
  rather than guessing).
- The 4848S040 names its bounce buffers to the LVGL port (`bounce_buffers` in
  the driver configuration), because the port must bind the frame-complete
  event rather than vsync for the tear-free wait when bounce buffers stream
  the panel.
- The ESP32-P4's PPA is off (`LV_USE_PPA`): its blocking fills held the render
  core 168-445 us each while the software blender, fed by QIO and the larger
  cache, does the same work in a fraction of that — measured -13-25% frame
  rate on square-fill dashboards with the accelerator on. The PPA patches
  stay in `firmware/patches/` for a later re-evaluation.
- The JC1060P470C's buffering is a build-time choice
  (`SIMCORE_DISPLAY_RENDER_MODE`): partial strips by default, with direct and
  full-screen modes selectable for a build that trades the measured frame
  rates for tear-free rendering into the panel's PSRAM buffers. Full was
  re-measured with every acceleration available to it — PPA on, and
  separately two draw units — and stays 2-3x behind partial on every
  dashboard pattern (repainting the whole 614k-pixel frame into PSRAM is
  bandwidth-bound at ~52-88% CPU); the tear-free builds skip the navigation
  controller's transition switching, since they are already tear-free.
- Levers re-measured against this configuration and rejected, so they are not
  tried again: merging invalidated areas into full-width rows (still −27–65%
  even with the flush off the render core — the extra blended pixels outcost
  the saved tree walks), a second software draw unit (−35–67%, the per-task
  dispatch overhead dwarfs the parallelism on widget-sized tasks), LVGL
  fast-mem in IRAM on the P4 (±0–2% — QIO plus the larger L2 already keep the
  hot code cached; the fragment stays S3-only), replacing the value pipeline's
  doubles with floats (±0% — they are too rare to matter, even soft-float),
  a full-screen PSRAM draw buffer, FULL render mode, 400 MHz (panic-loop on
  chips below rev 3), a 64-byte PPA burst, an asynchronous PPA-SRM blit draw unit for plain
  RGB565 image copies (mechanically sound — the hardware performed the blits —
  but the fixed ~250-400 us per transaction exceeds the software copy at every
  widget-sized image, and back-to-back sprites serialize behind the engine;
  only near-full-screen images would amortize it), and flattening the text
  widget into
  one box-sized label (the layout re-measure its content-sized label costs at
  refresh start is real, but a box-sized label invalidates the whole box on
  every value and the added blended pixels cost more on every display size).
- The panel-side vsync no longer paces LVGL, so a fast producer can render
  more frames than the panel shows; the extra frames cost CPU but not
  correctness. The per-type widget caps stay a frame decision, judged with
  `@SC:DIAG` as before.
