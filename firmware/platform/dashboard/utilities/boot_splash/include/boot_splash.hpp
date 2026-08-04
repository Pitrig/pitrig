#pragma once

#include <cstdint>

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::dashboard::boot_splash {

// Shows the display-sized SimCore startup asset. It is either retained or
// removed after at least the requested time. Returns false when the display
// resolution has no matching native asset.
[[nodiscard]] bool show(lv_display_t* display,
                        std::uint32_t minimum_duration_ms,
                        bool retain_after_minimum_duration);

}  // namespace simcore::dashboard::boot_splash
