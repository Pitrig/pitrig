#pragma once

#include <cstdint>

struct _lv_display_t;
using lv_display_t = _lv_display_t;
struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::dashboard {

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

struct Placement {
  std::int32_t x{};
  std::int32_t y{};
  std::int32_t width{};
  std::int32_t height{};
};

struct Layout {
  lv_display_t* display{};
};

// Validates that the display-backed absolute layout is available.
[[nodiscard]] bool initialize(Layout& layout);

}  // namespace simcore::dashboard
