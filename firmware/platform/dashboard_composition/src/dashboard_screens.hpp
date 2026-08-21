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

// Everything that makes a configuration's screens exist as LVGL objects, and
// everything that orders, un-clips or makes the tree touchable afterwards. The
// composition above owns the widgets; this owns what they are parented to and
// what happens to the tree once it stands.
namespace simcore::dashboard_composition::screens {

// Resolving a configured screen to an LVGL screen happens here and nowhere
// else. Index zero stays the display's active screen, which is what keeps the
// boot splash, the initial black paint, and the forced-refresh invalidation
// correct without a second mechanism; every screen above it is created and
// owned here. Nothing above this knows which of the two a screen is, except
// release(), which deletes only what this created.
[[nodiscard]] lv_obj_t* screen_object(lv_display_t* display, std::size_t index);

// Creates every configured screen with its background. Returns the number of
// screens created, zero when the display could not be prepared. Takes the LVGL
// lock itself. Container shapes are widgets, so they are built by the widget
// manager rather than here.
[[nodiscard]] std::size_t create(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard);

// Whether the configuration draws anything at all, which decides if the boot
// splash may hand over to it.
[[nodiscard]] bool will_render_content(
    const configuration::ApplicationConfiguration& configuration);

// Settles what each container does with a child that reaches past its box. The
// default is LVGL's own: cut it off at the edge. A container carrying
// `clip_children: false` instead draws it where it lands, which costs a
// measurement of how far its children actually reach — a caption overhanging a
// border is the common case — handed to LVGL as that container's extra draw
// size, widening drawing, hit-testing and invalidation together. Run after
// every widget exists and before z-ordering. Caller holds no lock; this takes
// it.
[[nodiscard]] bool apply_container_clipping(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard);

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

// Creates the screens a replacement added, beyond the `from` it already has,
// and paints each with its own background. Returns how many screens exist
// afterwards. Caller holds the LVGL lock. The screens that were already there
// are left alone: their widgets are standing on them.
[[nodiscard]] std::size_t extend(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard, std::size_t from);

// Points the slots controller at the slots the document describes: which page
// of each is in the loop, what raises another, and the objects to show. Forgets
// what it held first, so re-running it on slots that kept their objects leaves
// one binding rather than two. Caller holds the LVGL lock.
//
// The registry, the telemetry reader and the modifier readers come from the
// slot type's own storage, which is where the composition put them, so an
// incremental apply can rebind without carrying them back through.
[[nodiscard]] bool attach_slots(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard);

// Deletes the screens this created and loads the display's own screen back,
// and drops the view of the containers the shape collection owns. Caller holds
// the LVGL lock.
void release(Dashboard& dashboard);

}  // namespace simcore::dashboard_composition::screens
