#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace simcore::image_assets {

inline constexpr std::size_t kImageIdCapacity = 32;
inline constexpr std::size_t kMaximumImageIdLength = kImageIdCapacity - 1;
inline constexpr std::size_t kMaximumImages = 32;
// Matches CONFIG_LV_DRAW_BUF_ALIGN on the P4 and the cache line on both
// targets, so a copy into external RAM and an accelerated blit both start
// aligned.
inline constexpr std::size_t kImageAlignment = 64;
inline constexpr std::uint16_t kMaximumImageDimension = 2048;

using ImageId = std::array<char, kImageIdCapacity>;

// The pixel layouts the configurator may upload. The device never decodes, so
// these are the LVGL colour formats themselves rather than file formats.
enum class ColorFormat : std::uint8_t {
  rgb565 = 1,
  rgb565a8 = 2,
  indexed8 = 3,
  alpha8 = 4,
};

[[nodiscard]] constexpr std::string_view image_id_view(const ImageId& id) {
  std::size_t length = 0;
  while (length < id.size() && id[length] != '\0') {
    ++length;
  }
  return {id.data(), length};
}

// Same rule as a font family: lower case, digits, dash and underscore, so an
// identifier survives a round trip through JSON and a C string without
// surprises.
[[nodiscard]] constexpr bool valid_image_id(const ImageId& id) {
  const std::string_view view = image_id_view(id);
  if (view.empty() || view.size() > kMaximumImageIdLength) {
    return false;
  }
  for (std::size_t index = view.size(); index < id.size(); ++index) {
    if (id[index] != '\0') {
      return false;
    }
  }
  for (const char character : view) {
    const bool allowed = (character >= 'a' && character <= 'z') ||
                         (character >= '0' && character <= '9') ||
                         character == '-' || character == '_';
    if (!allowed) {
      return false;
    }
  }
  return true;
}

/** Bytes one row of the colour plane occupies for this format. */
[[nodiscard]] constexpr std::size_t color_stride(const ColorFormat format,
                                                 const std::uint16_t width) {
  switch (format) {
    case ColorFormat::rgb565:
    case ColorFormat::rgb565a8:
      return static_cast<std::size_t>(width) * 2;
    case ColorFormat::indexed8:
    case ColorFormat::alpha8:
      return width;
  }
  return 0;
}

/**
 * Total payload for an image, which is what the manifest's length has to match.
 * RGB565A8 stores the colour plane first and the alpha plane after it at half
 * the stride, which is the layout LVGL's decoder expects; an indexed image
 * carries its palette ahead of the pixels.
 */
[[nodiscard]] constexpr std::size_t image_bytes(const ColorFormat format,
                                                const std::uint16_t width,
                                                const std::uint16_t height,
                                                const std::uint16_t palette) {
  const std::size_t rows = height;
  const std::size_t colour = color_stride(format, width) * rows;
  const std::size_t alpha =
      format == ColorFormat::rgb565a8 ? static_cast<std::size_t>(width) * rows : 0;
  const std::size_t palette_bytes =
      format == ColorFormat::indexed8 ? static_cast<std::size_t>(palette) * 4 : 0;
  return palette_bytes + colour + alpha;
}

}  // namespace simcore::image_assets
