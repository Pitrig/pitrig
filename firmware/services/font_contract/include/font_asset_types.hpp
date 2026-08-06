#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace simcore::font_assets {

inline constexpr std::size_t kFamilyIdCapacity = 32;
inline constexpr std::size_t kMaximumFamilyIdLength = kFamilyIdCapacity - 1;
inline constexpr std::uint16_t kMaximumFontSizePx = 255;
using FamilyId = std::array<char, kFamilyIdCapacity>;

inline constexpr FamilyId kMontserratFamily{
    'm', 'o', 'n', 't', 's', 'e', 'r', 'r', 'a', 't', '\0'};

[[nodiscard]] constexpr std::string_view family_id_view(
    const FamilyId& family) {
  std::size_t size{};
  while (size < family.size() && family[size] != '\0') {
    ++size;
  }
  return {family.data(), size};
}

struct FontSpec {
  FamilyId family{kMontserratFamily};
  std::uint16_t size_px{48};
};

[[nodiscard]] constexpr bool operator==(const FontSpec& lhs,
                                        const FontSpec& rhs) {
  return lhs.family == rhs.family && lhs.size_px == rhs.size_px;
}

}  // namespace simcore::font_assets
