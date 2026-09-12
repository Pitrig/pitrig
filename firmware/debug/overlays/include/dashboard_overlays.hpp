#pragma once

#include "fps_overlay_widget.hpp"
#include "performance_overlay_widget.hpp"

namespace pitrig::transport {
class ITransport;
}

namespace pitrig::dashboard::overlays {

struct Views {
  performance_overlay_widget::View performance;
  fps_overlay_widget::View fps;
};

void create(Views& views, lv_display_t* display, const transport::ITransport& transport);

void destroy(Views& views);

}
