#pragma once

#include <cstddef>

#include "dashboard_composition.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;
struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::configuration {
struct ApplicationConfiguration;
}

// Everything that makes a configuration's screens and groups exist as LVGL
// objects, and everything that orders or makes them touchable afterwards. The
// composition above owns the widgets; this owns what they are parented to.
namespace simcore::dashboard_composition::screens {

// Resolving a configured screen to an LVGL screen happens here and nowhere
// else. Index zero stays the display's active screen, which is what keeps the
// boot splash, the initial black paint, and the forced-refresh invalidation
// correct without a second mechanism; every screen above it is created and
// owned here. Nothing above this knows which of the two a screen is, except
// release(), which deletes only what this created.
[[nodiscard]] lv_obj_t* screen_object(lv_display_t* display, std::size_t index);

// Creates every configured screen with its background, and a container per
// group within it. Returns the number of screens created, zero when the
// display could not be prepared. Takes the LVGL lock itself.
[[nodiscard]] std::size_t create(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard);

// Whether the configuration draws anything at all, which decides if the boot
// splash may hand over to it.
[[nodiscard]] bool will_render_content(
    const configuration::ApplicationConfiguration& configuration);

// Orders each parent's children by z_index, authored order breaking ties.
[[nodiscard]] bool apply_z_order(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard);

// Makes every authored tap target clickable. Re-run after any rebuild:
// update_instance() replaces a widget's LVGL object, and the replacement
// carries neither the flag nor the callback. The caller has already unbound the
// previous actions, so this only adds — a binding holds the object it sits on,
// and unbinding after a rebuild would touch a freed one.
[[nodiscard]] bool bind_actions(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard);

// Deletes the group containers and the screens this created, and loads the
// display's own screen back. Caller holds the LVGL lock.
void release(Dashboard& dashboard);

}  // namespace simcore::dashboard_composition::screens
