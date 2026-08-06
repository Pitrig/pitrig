#pragma once

#include "sdkconfig.h"

// Compile-time aliases keep debug-only code removable while checked-in board
// profiles and IDE tasks remain the single source of feature selection.
#define SIMCORE_DEBUG CONFIG_SIMCORE_DEBUG
#define SIMCORE_LAYOUT_DEBUG CONFIG_SIMCORE_LAYOUT_DEBUG
#define SIMCORE_DISPLAY_DIAGNOSTICS CONFIG_SIMCORE_DISPLAY_DIAGNOSTICS
