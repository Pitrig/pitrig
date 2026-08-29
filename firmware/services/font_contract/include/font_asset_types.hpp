#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace simcore::font_assets {

inline constexpr std::size_t kFamilyIdCapacity = 32;
inline constexpr std::size_t kMaximumFamilyIdLength = kFamilyIdCapacity - 1;
inline constexpr std::uint16_t kMaximumFontSizePx = 255;
inline constexpr std::size_t kMaximumFamilies = 8;
inline constexpr std::size_t kFaceAlignment = 4;
using FamilyId = std::array<char, kFamilyIdCapacity>;

[[nodiscard]] constexpr std::string_view family_id_view(
    const FamilyId& family) {
  std::size_t size{};
  while (size < family.size() && family[size] != '\0') {
    ++size;
  }
  return {family.data(), size};
}

[[nodiscard]] constexpr bool valid_family_id(const std::string_view family) {
  if (family.empty() || family.size() > kMaximumFamilyIdLength) {
    return false;
  }
  for (const char character : family) {
    const bool allowed = (character >= 'a' && character <= 'z') ||
                         (character >= '0' && character <= '9') ||
                         character == '_' || character == '-';
    if (!allowed) {
      return false;
    }
  }
  return true;
}

[[nodiscard]] constexpr bool valid_family_id(const FamilyId& family) {
  return valid_family_id(family_id_view(family));
}

struct FontSpec {
  FamilyId family{};
  std::uint16_t size_px{};
  FamilyId fallback{};
};

[[nodiscard]] constexpr bool has_fallback(const FontSpec& spec) {
  return spec.fallback.front() != '\0';
}

[[nodiscard]] constexpr FontSpec fallback_spec(const FontSpec& spec) {
  return FontSpec{.family = spec.fallback, .size_px = spec.size_px};
}

[[nodiscard]] constexpr bool operator==(const FontSpec& lhs,
                                        const FontSpec& rhs) {
  return lhs.family == rhs.family && lhs.size_px == rhs.size_px &&
         lhs.fallback == rhs.fallback;
}

}
