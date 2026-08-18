#pragma once

#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "font_asset_types.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;
struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::dashboard {

inline constexpr std::uint32_t kTransparentColor =
    configuration::kTransparentColor;

using font_assets::FontSpec;

struct Rect {
  std::int32_t x{};
  std::int32_t y{};
  std::int32_t width{};
  std::int32_t height{};
};

using Placement = configuration::WidgetPlacement;

// The screens a dashboard renders on, the containers within them, and the
// display they belong to. Widget storage is one dashboard-wide pool, so a widget
// names the parent it belongs to and that parent is resolved per widget rather
// than per collection.
struct Layout {
  lv_display_t* display{};
  std::span<lv_obj_t* const> screens{};
  // One entry per shape pool slot, filled as each shape is built. A container is
  // a widget like any other, so its own pool index is what addresses it.
  std::span<lv_obj_t* const> containers{};
  // One entry per slot page, flat: a slot's pool index times kMaximumSlotPages
  // plus the page. A page is not a widget and has no pool of its own, so the
  // arithmetic is what addresses it — no counter and no per-slot base.
  std::span<lv_obj_t* const> pages{};

  // Null for an index no screen was created for, which the caller reports as a
  // failed placement rather than parenting the widget somewhere arbitrary.
  [[nodiscard]] lv_obj_t* screen(const std::uint8_t index) const {
    return index < screens.size() ? screens[index] : nullptr;
  }

  // The LVGL object a widget is parented to, and therefore the box its
  // geometry is expressed in. Null when the container failed to build, which
  // refuses the child rather than silently reparenting it to the screen — where
  // its relative coordinates would mean somewhere else entirely.
  //
  // Takes the whole frame because which table parent_index addresses is the
  // frame's own business: a caller that had to pass the kind alongside the index
  // could pass a mismatched pair.
  [[nodiscard]] lv_obj_t* parent(const configuration::WidgetFrame& frame) const {
    switch (frame.parent_kind) {
      case configuration::WidgetParentKind::shape:
        return frame.parent_index < containers.size()
                   ? containers[frame.parent_index]
                   : nullptr;
      case configuration::WidgetParentKind::slot_page:
        return frame.parent_index < pages.size() ? pages[frame.parent_index]
                                                 : nullptr;
      case configuration::WidgetParentKind::screen:
        break;
    }
    return screen(frame.screen_index);
  }
};

}  // namespace simcore::dashboard
