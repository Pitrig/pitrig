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

// The screens a dashboard renders on, the container shapes within them, and the
// display they belong to. Widget storage is one dashboard-wide pool, so a widget
// names the parent it belongs to and that parent is resolved per widget rather
// than per collection.
struct Layout {
  lv_display_t* display{};
  std::span<lv_obj_t* const> screens{};
  // One entry per shape pool slot, filled as each shape is built. A container is
  // a widget like any other, so its own pool index is what addresses it.
  std::span<lv_obj_t* const> containers{};

  // Null for an index no screen was created for, which the caller reports as a
  // failed placement rather than parenting the widget somewhere arbitrary.
  [[nodiscard]] lv_obj_t* screen(const std::uint8_t index) const {
    return index < screens.size() ? screens[index] : nullptr;
  }

  // The LVGL object a widget is parented to, and therefore the box its
  // geometry is expressed in. Null when the container failed to build, which
  // refuses the child rather than silently reparenting it to the screen — where
  // its relative coordinates would mean somewhere else entirely.
  [[nodiscard]] lv_obj_t* parent(const std::uint8_t screen_index,
                                 const std::uint8_t parent_index,
                                 const bool parent_present) const {
    if (!parent_present) {
      return screen(screen_index);
    }
    return parent_index < containers.size() ? containers[parent_index]
                                            : nullptr;
  }
};

}  // namespace simcore::dashboard
