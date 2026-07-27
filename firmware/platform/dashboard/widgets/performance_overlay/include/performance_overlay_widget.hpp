#pragma once

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::transport {
class ITransport;
}

namespace simcore::dashboard::performance_overlay_widget {

// Creates the optional runtime diagnostics overlay for a display.
void create(lv_display_t* display, const transport::ITransport& transport);

}  // namespace simcore::dashboard::performance_overlay_widget
