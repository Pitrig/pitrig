#pragma once

#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "font_asset_types.hpp"
#include "lvgl_types.hpp"

namespace pitrig::dashboard {

inline constexpr std::uint32_t kTransparentColor = configuration::kTransparentColor;

using font_assets::FontSpec;

struct Rect {
  std::int32_t x{};
  std::int32_t y{};
  std::int32_t width{};
  std::int32_t height{};
};

using Placement = configuration::WidgetPlacement;

struct Layout {
  lv_display_t* display{};
  std::span<lv_obj_t* const> screens{};
  std::span<lv_obj_t* const> containers{};
  std::span<lv_obj_t* const> pages{};

  [[nodiscard]] lv_obj_t* screen(const std::uint8_t index) const {
    return index < screens.size() ? screens[index] : nullptr;
  }

  [[nodiscard]] lv_obj_t* parent(const configuration::WidgetFrame& frame) const {
    switch (frame.parent_kind) {
      case configuration::WidgetParentKind::shape:
        return frame.parent_index < containers.size() ? containers[frame.parent_index] : nullptr;
      case configuration::WidgetParentKind::slot_page:
        return frame.parent_index < pages.size() ? pages[frame.parent_index] : nullptr;
      case configuration::WidgetParentKind::screen:
        break;
    }
    return screen(frame.screen_index);
  }
};

}
