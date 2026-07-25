# Runtime Performance Diagnostics

`PerformanceService` publishes a one-second snapshot containing FPS, CPU usage
per core, LVGL render time, display flush time, internal heap information,
available PSRAM, and uptime.

## Build options

The service requires these ESP-IDF options:

```text
CONFIG_FREERTOS_GENERATE_RUN_TIME_STATS=y
CONFIG_FREERTOS_RUN_TIME_COUNTER_TYPE_U64=y
CONFIG_FREERTOS_RUN_TIME_STATS_USING_ESP_TIMER=y
```

The 64-bit ESP Timer counter avoids the short wrap interval of the default
32-bit runtime counter. Runtime diagnostics are disabled by default. Select
the build contents in the root firmware `CMakeLists.txt`:

```cmake
set(SIMCORE_DEBUG ON)
```

Set it to `OFF` for a production build. Without `SIMCORE_DEBUG`, the performance
service, display instrumentation, and dashboard overlay are not compiled into
the firmware. The production profile also restores the normal dashboard
cadence: a 16 ms Lap Timer update, 16 ms maximum LVGL task sleep, and a 5 ms
LVGL tick. Debug builds use the more aggressive 8 ms update/sleep and 2 ms tick
needed for performance measurements.

## Measurements

- **FPS:** number of LVGL refreshes that performed rendering, divided by the
  actual sampling interval. Idle refresh callbacks are not counted.
- **CPU0 / CPU1:** `100%` minus the idle task runtime percentage for each core,
  calculated from consecutive FreeRTOS runtime-counter samples.
- **Render time:** average duration between LVGL render-start and render-ready
  events during the sampling interval.
- **Flush time:** average duration from LVGL flush-start until LVGL finishes
  waiting for the asynchronous display transfer.
- **Heap:** current free internal 8-bit heap and its largest free block.
- **PSRAM:** current free SPIRAM heap, or zero when SPIRAM is unavailable.

The service owns measurement and aggregation. The dashboard widget only reads
the latest statistics snapshot and formats it for display.
