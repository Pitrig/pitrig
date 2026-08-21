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
// Frames one image may hold as a sprite sheet. A frame is an offset into the
// buffer the image was already loaded into, so this bounds what an author can
// address rather than what the device spends. Must match kMaximumSpriteFrames
// in the configuration contract.
inline constexpr std::uint16_t kMaximumSpriteFrames = 64;

using ImageId = std::array<char, kImageIdCapacity>;

// The pixel layouts the configurator may upload. The device never decodes, so
// these are the LVGL colour formats themselves rather than file formats.
//
// `indexed8` is reserved rather than supported. LVGL cannot blend an indexed
// image at all: it converts one to ARGB8888 a line at a time on every repaint,
// which also puts it outside the ESP32-P4 accelerator's RGB565/RGB888 gate, so
// it would trade frames for storage that compression buys back for free. The
// value stays spoken for so it can never come to mean something else.
enum class ColorFormat : std::uint8_t {
  rgb565 = 1,
  rgb565a8 = 2,
  indexed8_reserved = 3,
  alpha8 = 4,
};

// How the bytes in the package are stored. Pixels reach LVGL raw either way —
// a compressed asset is inflated once, into the external RAM the dashboard
// draws from — so this costs flash and nothing else.
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

/**
 * Bytes one row of the colour plane occupies for this format. Zero for a
 * format the device does not draw, which the manifest's stride check then
 * rejects — no supported format has a zero-width row.
 */
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

/**
 * One frame's size once it is in memory. RGB565A8 stores the colour plane first
 * and the alpha plane after it at half the stride, which is the layout LVGL
 * expects — and the reason a sprite sheet stores whole frames back to back
 * rather than stacking their rows: only whole frames are contiguous in every
 * format, which is what lets a frame be a plain offset with no draw-time cost.
 */
[[nodiscard]] constexpr std::size_t frame_bytes(const ColorFormat format,
                                                const std::uint16_t width,
                                                const std::uint16_t height) {
  const std::size_t rows = height;
  const std::size_t colour = color_stride(format, width) * rows;
  const std::size_t alpha =
      format == ColorFormat::rgb565a8 ? static_cast<std::size_t>(width) * rows : 0;
  return colour + alpha;
}

/**
 * Every frame of the image, which is what the manifest's length has to match
 * for an uncompressed asset and what has to be reserved for a compressed one.
 */
[[nodiscard]] constexpr std::size_t image_bytes(const ColorFormat format,
                                                const std::uint16_t width,
                                                const std::uint16_t height,
                                                const std::uint16_t frames) {
  return frame_bytes(format, width, height) * frames;
}

}  // namespace simcore::image_assets
