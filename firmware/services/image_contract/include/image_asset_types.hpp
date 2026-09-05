#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace pitrig::image_assets {

inline constexpr std::size_t kImageIdCapacity = 32;
inline constexpr std::size_t kMaximumImageIdLength = kImageIdCapacity - 1;
inline constexpr std::size_t kMaximumImages = 32;
inline constexpr std::size_t kImageAlignment = 64;
inline constexpr std::uint16_t kMaximumImageDimension = 2048;
inline constexpr std::uint16_t kMaximumSpriteFrames = 64;

using ImageId = std::array<char, kImageIdCapacity>;

enum class ColorFormat : std::uint8_t {
  rgb565 = 1,
  rgb565a8 = 2,
  indexed8_reserved = 3,
  alpha8 = 4,
};

enum class Compression : std::uint8_t {
  none = 0,
  deflate = 1,
};

[[nodiscard]] constexpr std::string_view image_id_view(const ImageId& id) {
  std::size_t length = 0;
  while (length < id.size() && id[length] != '\0') {
    ++length;
  }
  return {id.data(), length};
}

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

[[nodiscard]] constexpr std::size_t color_stride(const ColorFormat format,
                                                 const std::uint16_t width) {
  switch (format) {
    case ColorFormat::rgb565:
    case ColorFormat::rgb565a8:
      return static_cast<std::size_t>(width) * 2;
    case ColorFormat::alpha8:
      return width;
    case ColorFormat::indexed8_reserved:
      return 0;
  }
  return 0;
}

[[nodiscard]] constexpr std::size_t frame_bytes(const ColorFormat format,
                                                const std::uint16_t width,
                                                const std::uint16_t height) {
  const std::size_t rows = height;
  const std::size_t colour = color_stride(format, width) * rows;
  const std::size_t alpha =
      format == ColorFormat::rgb565a8 ? static_cast<std::size_t>(width) * rows : 0;
  return colour + alpha;
}

[[nodiscard]] constexpr std::size_t image_bytes(const ColorFormat format,
                                                const std::uint16_t width,
                                                const std::uint16_t height,
                                                const std::uint16_t frames) {
  return frame_bytes(format, width, height) * frames;
}

}
