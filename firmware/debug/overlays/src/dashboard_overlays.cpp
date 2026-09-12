#include "dashboard_overlays.hpp"

#include "logger.hpp"
#include "pitrig_features.hpp"

namespace pitrig::dashboard::overlays {
namespace {

constexpr char kTag[] = "overlays";

}

void create(Views& views, lv_display_t* const display, const transport::ITransport& transport) {
#if PITRIG_DEBUG_OVERLAY_FULL
  if (!views.performance.create(display, transport)) {
    log::warn(kTag, "Failed to create the performance overlay");
  }
#elif PITRIG_DEBUG_OVERLAY_FPS
  (void)transport;
  if (!views.fps.create(display)) {
    log::warn(kTag, "Failed to create the FPS overlay");
  }
#else
  (void)views;
  (void)display;
  (void)transport;
  (void)kTag;
#endif
}

void destroy(Views& views) {
  views.performance.destroy();
  views.fps.destroy();
}

}
