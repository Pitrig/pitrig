#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

struct _lv_display_t;
using lv_display_t = _lv_display_t;
struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::dashboard {

using RegionId = std::uint16_t;
inline constexpr RegionId kScreenRegionId = 0;
inline constexpr std::uint32_t kTransparentColor = 0xFFFF'FFFFU;

enum class FontFamily : std::uint8_t {
  roboto_mono,
  lcd,
  montserrat,
};

struct FontSpec {
  FontFamily family{FontFamily::lcd};
  std::uint16_t size_px{39};
};

struct Rect {
  std::int32_t x{};
  std::int32_t y{};
  std::int32_t width{};
  std::int32_t height{};
};

struct Insets {
  std::uint16_t left{};
  std::uint16_t top{};
  std::uint16_t right{};
  std::uint16_t bottom{};
};

struct RegionStyle {
  std::uint32_t background_color{};
  std::uint32_t border_color{};
  std::uint16_t border_width_px{};
  std::uint16_t radius_px{};
  bool visible{};
};

struct LayoutRegion {
  RegionId id{kScreenRegionId};
  Rect bounds{};
  Insets padding{};
  RegionStyle style{};
};

enum class Anchor : std::uint8_t {
  top_left,
  top_center,
  top_right,
  left_center,
  center,
  right_center,
  bottom_left,
  bottom_center,
  bottom_right,
};

struct Placement {
  RegionId region_id{kScreenRegionId};
  Anchor anchor{Anchor::center};
  std::int32_t offset_x{};
  std::int32_t offset_y{};
  std::int32_t width{};
  std::int32_t height{};
};

struct Layout {
  static constexpr std::size_t kMaxRegions = 8;

  lv_display_t* display{};
  std::span<const LayoutRegion> regions{};
  std::array<lv_obj_t*, kMaxRegions> region_objects{};
};

// Creates visible region panels and validates the configured layout.
[[nodiscard]] bool initialize(Layout& layout);

}  // namespace simcore::dashboard
