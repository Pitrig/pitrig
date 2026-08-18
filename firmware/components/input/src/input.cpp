#include "input.hpp"

#include <cstdint>

#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace {

// How fast the finger must be moving for its travel to count toward a swipe.
// The distance itself stays at LVGL's default.
//
// LVGL zeroes the accumulated distance on any read where the finger moved less
// than the velocity, so the velocity is a floor on the whole gesture rather
// than a way to reject a flick. Its default of 3 px is read against
// LV_DEF_REFR_PERIOD, 8 ms here, which asks for more than 375 px/s sustained —
// a flick, not a swipe, and a deliberate slow swipe never registered at all.
// One pixel per read means "the finger is moving", which still zeroes the
// distance for a finger held still, so a long press does not drift into a
// gesture.
constexpr std::uint8_t kGestureMinimumVelocityPx = 1;

// How far the finger must travel before the movement is a swipe. LVGL asks for
// 50 px, which is a tenth of the width of the smallest touch board here and
// more than a wrist moves comfortably on a device clamped to a wheel. A tap
// that slides this far is no longer a tap: the handlers ignore a click whose
// press produced a gesture, so this is also the point where a sloppy tap stops
// triggering the widget under it.
constexpr std::uint8_t kGestureMinimumDistancePx = 20;

}  // namespace

namespace simcore::input {

lv_indev_t* initialize(const driver::Driver& selected_driver,
                       lv_display_t* const display) {
  if (selected_driver.initialize == nullptr) {
    return nullptr;
  }
  const driver::Configuration hardware = selected_driver.initialize();
  if (hardware.touch == nullptr) {
    return nullptr;
  }

  lvgl_port_touch_cfg_t touch_configuration = {};
  touch_configuration.disp = display;
  touch_configuration.handle = hardware.touch;

  lv_indev_t* const pointer = lvgl_port_add_touch(&touch_configuration);
  if (pointer != nullptr) {
    lv_indev_set_gesture_min_velocity(pointer, kGestureMinimumVelocityPx);
    lv_indev_set_gesture_min_distance(pointer, kGestureMinimumDistancePx);
  }
  return pointer;
}

}  // namespace simcore::input
