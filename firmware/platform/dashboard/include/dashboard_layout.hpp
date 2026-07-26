#pragma once

#include <cstdint>

namespace simcore::dashboard {

enum class FontFamily : std::uint8_t {
  roboto_mono,
  lcd,
};

struct FontSpec {
  FontFamily family{FontFamily::lcd};
  std::uint16_t size_px{58};
};

struct WidgetBlock {
  std::int32_t x{};
  std::int32_t y{};
  std::int32_t width{};
  std::int32_t height{};
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
  Anchor anchor{Anchor::center};
  std::int32_t offset_x{};
  std::int32_t offset_y{};
};

}  // namespace simcore::dashboard
