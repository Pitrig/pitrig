#pragma once

#include "sdkconfig.h"

// Compile-time aliases keep debug-only code removable while checked-in board
// profiles and IDE tasks remain the single source of feature selection.
#define SIMCORE_DEBUG CONFIG_SIMCORE_DEBUG
#define SIMCORE_LAYOUT_DEBUG CONFIG_SIMCORE_LAYOUT_DEBUG
// ADR 0001: logging mode is chosen at compile time inside the logger, with the
// public API unchanged either way. Spelled with #ifdef because Kconfig leaves a
// disabled bool undefined rather than defining it to 0.
#ifdef CONFIG_SIMCORE_LOG_MODE_FULL
#define SIMCORE_LOG_MODE_FULL 1
#endif
// Development-only second serial link. Off in a product build, which is what
// keeps the multi-link cost out of it entirely. Spelled 0/1 rather than aliased
// because these are read in expressions as well as in preprocessor conditions.
#ifdef CONFIG_SIMCORE_SECOND_TELEMETRY_LINK
#define SIMCORE_SECOND_TELEMETRY_LINK 1
#else
#define SIMCORE_SECOND_TELEMETRY_LINK 0
#endif

#ifdef CONFIG_SIMCORE_SECOND_TELEMETRY_LINK_SILENCE_LOGS
#define SIMCORE_SECOND_TELEMETRY_LINK_SILENCE_LOGS 1
#else
#define SIMCORE_SECOND_TELEMETRY_LINK_SILENCE_LOGS 0
#endif

// Which core each half of the firmware runs on. Communication — the transport
// read tasks, the control and asset-upload tasks, and the render trigger they
// wake — is on one core, LVGL alone on the other, so parsing and a live apply
// never preempt a frame. The trigger has the lower priority on its core, so a
// received chunk is parsed to the end before the single pass it triggers.
#define SIMCORE_COMMUNICATION_CORE 0
#define SIMCORE_RENDER_CORE 1
