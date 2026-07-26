#include "dashboard_layout_internal.hpp"

#include <algorithm>

#include "esp_lvgl_port.h"

namespace simcore::dashboard {
namespace {

#if SIMCORE_LAYOUT_DEBUG
constexpr std::uint32_t kRegionOutlineColorRgb = 0x00E5FF;
constexpr std::uint32_t kWidgetOutlineColorRgb = 0xFF2D95;
constexpr std::int32_t kDebugOutlineWidthPx = 1;
constexpr std::int32_t kDebugOutlinePadPx = -1;

void apply_outline(lv_obj_t* const object, const std::uint32_t color_rgb) {
  lv_obj_set_style_outline_width(object, kDebugOutlineWidthPx, LV_PART_MAIN);
  lv_obj_set_style_outline_pad(object, kDebugOutlinePadPx, LV_PART_MAIN);
  lv_obj_set_style_outline_color(object, lv_color_hex(color_rgb), LV_PART_MAIN);
  lv_obj_set_style_outline_opa(object, LV_OPA_COVER, LV_PART_MAIN);
}
#endif

[[nodiscard]] bool valid_region(const LayoutRegion& region) {
  if (region.id == kScreenRegionId || region.bounds.width <= 0 ||
      region.bounds.height <= 0) {
    return false;
  }

  const std::int32_t border =
      region.style.visible ? region.style.border_width_px : 0;
  const std::int32_t horizontal_inset =
      border * 2 + region.padding.left + region.padding.right;
  const std::int32_t vertical_inset =
      border * 2 + region.padding.top + region.padding.bottom;
  return horizontal_inset < region.bounds.width &&
         vertical_inset < region.bounds.height;
}

[[nodiscard]] const LayoutRegion* find_region(
    const std::span<const LayoutRegion> regions, const RegionId id) {
  for (const LayoutRegion& region : regions) {
    if (region.id == id) {
      return &region;
    }
  }
  return nullptr;
}

[[nodiscard]] Rect content_bounds(const LayoutRegion& region) {
  const std::int32_t border =
      region.style.visible ? region.style.border_width_px : 0;
  return {
      .x = 0,
      .y = 0,
      .width = region.bounds.width - 2 * border - region.padding.left -
               region.padding.right,
      .height = region.bounds.height - 2 * border - region.padding.top -
                region.padding.bottom,
  };
}

void anchor_position(const Rect& parent, const Anchor anchor,
                     const std::int32_t width, const std::int32_t height,
                     std::int32_t& x, std::int32_t& y) {
  x = parent.x;
  y = parent.y;
  switch (anchor) {
    case Anchor::top_left:
      break;
    case Anchor::top_center:
      x += (parent.width - width) / 2;
      break;
    case Anchor::top_right:
      x += parent.width - width;
      break;
    case Anchor::left_center:
      y += (parent.height - height) / 2;
      break;
    case Anchor::center:
      x += (parent.width - width) / 2;
      y += (parent.height - height) / 2;
      break;
    case Anchor::right_center:
      x += parent.width - width;
      y += (parent.height - height) / 2;
      break;
    case Anchor::bottom_left:
      y += parent.height - height;
      break;
    case Anchor::bottom_center:
      x += (parent.width - width) / 2;
      y += parent.height - height;
      break;
    case Anchor::bottom_right:
      x += parent.width - width;
      y += parent.height - height;
      break;
  }
}

}  // namespace

bool initialize(Layout& layout) {
  if (layout.display == nullptr ||
      layout.regions.size() > layout.region_objects.size()) {
    return false;
  }

  for (std::size_t index = 0; index < layout.regions.size(); ++index) {
    const LayoutRegion& region = layout.regions[index];
    if (!valid_region(region)) {
      return false;
    }
    for (std::size_t other = index + 1; other < layout.regions.size(); ++other) {
      if (region.id == layout.regions[other].id) {
        return false;
      }
    }
  }

  if (!lvgl_port_lock(0)) {
    return false;
  }
  lv_obj_t* const screen = lv_display_get_screen_active(layout.display);
  for (std::size_t index = 0; index < layout.regions.size(); ++index) {
    const LayoutRegion& region = layout.regions[index];
    lv_obj_t* const panel = lv_obj_create(screen);
    lv_obj_remove_style_all(panel);
    lv_obj_set_pos(panel, region.bounds.x, region.bounds.y);
    lv_obj_set_size(panel, region.bounds.width, region.bounds.height);
    lv_obj_remove_flag(panel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(panel, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(panel, LV_OBJ_FLAG_OVERFLOW_VISIBLE);
    lv_obj_set_style_radius(panel, region.style.radius_px, LV_PART_MAIN);
    lv_obj_set_style_clip_corner(panel, true, LV_PART_MAIN);
    lv_obj_set_style_pad_left(panel, region.padding.left, LV_PART_MAIN);
    lv_obj_set_style_pad_top(panel, region.padding.top, LV_PART_MAIN);
    lv_obj_set_style_pad_right(panel, region.padding.right, LV_PART_MAIN);
    lv_obj_set_style_pad_bottom(panel, region.padding.bottom, LV_PART_MAIN);
    if (region.style.visible) {
      lv_obj_set_style_bg_color(panel,
                                lv_color_hex(region.style.background_color_rgb),
                                LV_PART_MAIN);
      lv_obj_set_style_bg_opa(panel, LV_OPA_COVER, LV_PART_MAIN);
      lv_obj_set_style_border_width(panel, region.style.border_width_px,
                                    LV_PART_MAIN);
      lv_obj_set_style_border_color(
          panel, lv_color_hex(region.style.border_color_rgb), LV_PART_MAIN);
      lv_obj_set_style_border_opa(panel, LV_OPA_COVER, LV_PART_MAIN);
    }
    layout.region_objects[index] = panel;
#if SIMCORE_LAYOUT_DEBUG
    apply_outline(panel, kRegionOutlineColorRgb);
#endif
  }
  lvgl_port_unlock();
  return true;
}

bool resolve_widget_bounds(const Layout& layout, const Placement& placement,
                           const std::int32_t intrinsic_width,
                           const std::int32_t intrinsic_height,
                           const bool fill_available_width, lv_obj_t*& parent,
                           Rect& bounds) {
  if (layout.display == nullptr || intrinsic_width <= 0 ||
      intrinsic_height <= 0 || placement.width < 0 || placement.height < 0) {
    return false;
  }

  parent = lv_display_get_screen_active(layout.display);
  Rect parent_bounds{
      .x = 0,
      .y = 0,
      .width = lv_display_get_horizontal_resolution(layout.display),
      .height = lv_display_get_vertical_resolution(layout.display),
  };
  if (placement.region_id != kScreenRegionId) {
    const LayoutRegion* const region = find_region(
        layout.regions, placement.region_id);
    if (region == nullptr) {
      return false;
    }
    const std::size_t region_index =
        static_cast<std::size_t>(region - layout.regions.data());
    parent = layout.region_objects[region_index];
    if (parent == nullptr) {
      return false;
    }
    parent_bounds = content_bounds(*region);
  }

  const std::int32_t requested_width =
      placement.width > 0
          ? placement.width
          : (fill_available_width ? parent_bounds.width : intrinsic_width);
  const std::int32_t requested_height =
      placement.height > 0 ? placement.height : intrinsic_height;
  bounds.width =
      requested_width < parent_bounds.width ? requested_width
                                            : parent_bounds.width;
  bounds.height =
      requested_height < parent_bounds.height ? requested_height
                                              : parent_bounds.height;
  if (parent == nullptr || bounds.width <= 0 || bounds.height <= 0) {
    return false;
  }
  anchor_position(parent_bounds, placement.anchor, bounds.width, bounds.height,
                  bounds.x, bounds.y);
  bounds.x += placement.offset_x;
  bounds.y += placement.offset_y;
  bounds.x = std::clamp(bounds.x, parent_bounds.x,
                        parent_bounds.x + parent_bounds.width - bounds.width);
  bounds.y =
      std::clamp(bounds.y, parent_bounds.y,
                 parent_bounds.y + parent_bounds.height - bounds.height);
  return true;
}

#if SIMCORE_LAYOUT_DEBUG
void apply_debug_widget_outline(lv_obj_t* const object) {
  apply_outline(object, kWidgetOutlineColorRgb);
}
#endif

}  // namespace simcore::dashboard
