#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace simcore::font_assets {

inline constexpr std::size_t kFamilyIdCapacity = 32;
inline constexpr std::size_t kMaximumFamilyIdLength = kFamilyIdCapacity - 1;
inline constexpr std::uint16_t kMaximumFontSizePx = 255;
// An uploaded package carries one face per family and every pixel size is
// rasterized from it, so this bounds both the package and the number of
// families one configuration may name.
inline constexpr std::size_t kMaximumFamilies = 8;
// Package manifest offsets and the runtime copy of a face must agree on this,
// or the reservation computed from the manifest under-serves the copy.
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

// The package service and configuration validation both reject a family that
// fails this, so the rule lives with the type they share.
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
};

[[nodiscard]] constexpr bool operator==(const FontSpec& lhs,
                                        const FontSpec& rhs) {
  return lhs.family == rhs.family && lhs.size_px == rhs.size_px;
}

}  // namespace simcore::font_assets
