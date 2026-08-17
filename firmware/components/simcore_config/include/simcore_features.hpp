#pragma once

#include "sdkconfig.h"

// Compile-time aliases keep debug-only code removable while checked-in board
// profiles and IDE tasks remain the single source of feature selection.
#define SIMCORE_DEBUG CONFIG_SIMCORE_DEBUG
#define SIMCORE_LAYOUT_DEBUG CONFIG_SIMCORE_LAYOUT_DEBUG
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
