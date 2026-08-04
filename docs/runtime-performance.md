# Runtime Performance Diagnostics

`PerformanceService` publishes a one-second snapshot containing FPS, CPU usage
per core, LVGL render time, display flush time, internal heap information,
available PSRAM, and uptime.

## Build profile

Runtime diagnostics are disabled in production. Enable them by changing the
source-level feature in `firmware/components/simcore_config/include/simcore_features.hpp`:

```cpp
#define SIMCORE_DEBUG 1
```

Build with the debug ESP-IDF defaults appended after the board profile:

```sh
idf.py -B build-debug \
  -DSDKCONFIG=/tmp/simcore-sdkconfig-debug \
  -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.t-display-s3;sdkconfig.defaults.debug" \
  build
```

Use the required board defaults file in place of `sdkconfig.defaults.t-display-s3`.
The debug defaults enable the 64-bit ESP Timer runtime counter required for CPU
load measurement. Without `SIMCORE_DEBUG`, transport diagnostics, display
instrumentation, and the dashboard overlay are removed from the production hot
path, and FreeRTOS runtime statistics remain disabled.

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
