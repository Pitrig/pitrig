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
- Tearing is accepted: a strip lands in the frame buffer mid-scan. For numeric
  readouts the artifact is a one-frame horizontal seam inside a glyph, judged
  worth 14–17 ms of latency on every value the dashboard shows.
- `esp_lvgl_port`'s DSI partial path is patched
  (`patches/esp-lvgl-port-2.8.0-dsi-partial-flush-ready.patch`, applied with
  the existing cache-safe callback patch on the ESP32-P4). Upstream defers
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
  rather than a scan-out wait, so the frame budget is almost entirely render
  time. Figures in that document measured under direct mode are marked as such.
- A flash write during a flush is safe on the P4 only because the ISR touches
  nothing outside IRAM and internal RAM; the patch must be reviewed if
  `esp_lvgl_port` is upgraded past 2.8.0~1 (the apply script fails the build
  rather than guessing).
- The panel-side vsync no longer paces LVGL, so a fast producer can render
  more frames than the panel shows; the extra frames cost CPU but not
  correctness. The per-type widget caps stay a frame decision, judged with
  `@SC:DIAG` as before.
