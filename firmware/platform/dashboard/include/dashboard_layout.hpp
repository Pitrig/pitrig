#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

struct _lv_display_t;
using lv_display_t = _lv_display_t;
struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::dashboard {

inline constexpr std::uint32_t kTransparentColor = 0xFFFF'FFFFU;

inline constexpr std::size_t kFontFamilyIdCapacity = 32;
inline constexpr std::size_t kMaximumFontFamilyIdLength =
    kFontFamilyIdCapacity - 1;
inline constexpr std::uint16_t kMaximumFontSizePx = 255;
using FontFamilyId = std::array<char, kFontFamilyIdCapacity>;

inline constexpr FontFamilyId kMontserratFontFamily{
    'm', 'o', 'n', 't', 's', 'e', 'r', 'r', 'a', 't', '\0'};

[[nodiscard]] constexpr std::string_view font_family_id_view(
    const FontFamilyId& family) {
  std::size_t size{};
  while (size < family.size() && family[size] != '\0') {
    ++size;
  }
  return {family.data(), size};
}

struct FontSpec {
  FontFamilyId family{kMontserratFontFamily};
  std::uint16_t size_px{48};
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
