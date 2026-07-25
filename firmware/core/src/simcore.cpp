#include "simcore.hpp"

#include "lap_timer_widget.hpp"
#include "display.hpp"
#include "logger.hpp"
#include "mock_telemetry.hpp"
#ifdef SIMCORE_DEBUG
#include "performance.hpp"
#include "performance_overlay_widget.hpp"
#endif

namespace simcore {
namespace {

constexpr char kTag[] = "simcore";

}

void run() {
  log::info(kTag, "SimCore starting");
#ifdef SIMCORE_DEBUG
  performance::begin();
#endif
  lv_display_t* display = display::initialize();
  dashboard::lap_timer_widget::create(display);
#ifdef SIMCORE_DEBUG
  dashboard::performance_overlay_widget::create(display);
#endif
  mock_telemetry::start();
}

}
