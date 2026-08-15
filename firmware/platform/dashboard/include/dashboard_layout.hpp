#pragma once

#include <cstdint>

#include "application_configuration.hpp"
#include "font_asset_types.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;
struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::dashboard {

inline constexpr std::uint32_t kTransparentColor =
    configuration::kTransparentColor;

using font_assets::FamilyId;
using font_assets::FontSpec;

struct Rect {
  std::int32_t x{};
  std::int32_t y{};
  std::int32_t width{};
  std::int32_t height{};
};

using Insets = configuration::WidgetInsets;
using Placement = configuration::WidgetPlacement;

// The screen a widget is placed on, and the display that screen belongs to.
// Geometry resolves against the screen, so adding screens later changes the
// collection that produces this, not the widgets that consume it.
struct Layout {
  lv_display_t* display{};
  lv_obj_t* screen{};
};

}  // namespace simcore::dashboard
