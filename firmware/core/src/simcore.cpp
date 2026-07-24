#include "simcore.hpp"

#include "display.hpp"
#include "lap_timer.hpp"
#include "logger.hpp"

namespace simcore {
namespace {

constexpr char kTag[] = "simcore";

}

void run() {
  log::info(kTag, "SimCore starting");
  lv_display_t* display = display::initialize();
  lv_obj_t* lap_time = lap_timer::create(display);
  lap_timer::set_time(lap_time, 83'456);
}

}
