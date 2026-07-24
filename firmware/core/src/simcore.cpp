#include "simcore.hpp"

#include "lap_timer_widget.hpp"
#include "display.hpp"
#include "logger.hpp"
#include "mock_telemetry.hpp"

namespace simcore {
namespace {

constexpr char kTag[] = "simcore";

}

void run() {
  log::info(kTag, "SimCore starting");
  lv_display_t* display = display::initialize();
  dashboard::lap_timer_widget::create(display);
  mock_telemetry::start();
}

}
