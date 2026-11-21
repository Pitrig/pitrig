#include "track_map_raster.hpp"

#include <algorithm>
#include <cmath>

namespace pitrig::dashboard::track_map_widget::raster {
namespace {

constexpr float kHalfPixel = 0.5F;
constexpr float kOpaque = 255.0F;
constexpr std::uint32_t kFull = 255;

[[nodiscard]] std::uint32_t red(const std::uint16_t pixel) {
  return ((pixel >> 11U) & 31U) * 255U / 31U;
}

[[nodiscard]] std::uint32_t green(const std::uint16_t pixel) {
  return ((pixel >> 5U) & 63U) * 255U / 63U;
}

[[nodiscard]] std::uint32_t blue(const std::uint16_t pixel) { return (pixel & 31U) * 255U / 31U; }

[[nodiscard]] std::uint16_t pack(const std::uint32_t r, const std::uint32_t g,
                                 const std::uint32_t b) {
  return static_cast<std::uint16_t>(((r >> 3U) << 11U) | ((g >> 2U) << 5U) | (b >> 3U));
}

[[nodiscard]] std::uint32_t mix(const std::uint32_t under, const std::uint32_t over,
                                const std::uint32_t amount) {
  return (under * (kFull - amount) + over * amount + kFull / 2) / kFull;
}

[[nodiscard]] std::uint16_t blend(const std::uint16_t pixel, const std::uint32_t rgb,
                                  const std::uint32_t amount) {
  return pack(mix(red(pixel), (rgb >> 16U) & kFull, amount),
              mix(green(pixel), (rgb >> 8U) & kFull, amount),
              mix(blue(pixel), rgb & kFull, amount));
}

[[nodiscard]] float distance(const float x, const float y, const ScreenPoint from,
                             const ScreenPoint to) {
  const float along_x = to.x - from.x;
  const float along_y = to.y - from.y;
  const float length = along_x * along_x + along_y * along_y;
  const float share =
      length > 0.0F ? std::clamp(((x - from.x) * along_x + (y - from.y) * along_y) / length, 0.0F,
                                 1.0F)
                    : 0.0F;
  return std::hypot(from.x + along_x * share - x, from.y + along_y * share - y);
}

}

Layer::Layer(const std::span<std::uint16_t> pixels, const std::int32_t stride,
             const std::int32_t width, const std::int32_t height,
             const std::span<std::uint8_t> coverage)
    : pixels_(pixels),
      coverage_(coverage),
      stride_(stride),
      width_(width),
      height_(height),
      left_(width),
      top_(height) {}

void Layer::segment(const ScreenPoint from, const ScreenPoint to, const float width) {
  const float half = width / 2.0F;
  const float reach = half + 1.0F;
  const auto lowest_x = static_cast<std::int32_t>(std::floor(std::min(from.x, to.x) - reach));
  const auto first_x = std::max<std::int32_t>(0, lowest_x);
  const auto last_x =
      std::min(width_ - 1, static_cast<std::int32_t>(std::ceil(std::max(from.x, to.x) + reach)));
  const auto lowest_y = static_cast<std::int32_t>(std::floor(std::min(from.y, to.y) - reach));
  const auto first_y = std::max<std::int32_t>(0, lowest_y);
  const auto last_y =
      std::min(height_ - 1, static_cast<std::int32_t>(std::ceil(std::max(from.y, to.y) + reach)));
  for (std::int32_t y = first_y; y <= last_y; ++y) {
    for (std::int32_t x = first_x; x <= last_x; ++x) {
      const float inside = half + kHalfPixel -
                           distance(static_cast<float>(x) + kHalfPixel,
                                    static_cast<float>(y) + kHalfPixel, from, to);
      if (inside > 0.0F) {
        cover(x, y, std::min(inside, 1.0F));
      }
    }
  }
}

void Layer::cover(const std::int32_t x, const std::int32_t y, const float amount) {
  std::uint8_t& covered = coverage_[static_cast<std::size_t>(y * width_ + x)];
  covered = std::max(covered, static_cast<std::uint8_t>(std::lround(amount * kOpaque)));
  left_ = std::min(left_, x);
  right_ = std::max(right_, x);
  top_ = std::min(top_, y);
  bottom_ = std::max(bottom_, y);
}

void Layer::paint(const std::uint32_t rgb) {
  for (std::int32_t y = top_; y <= bottom_; ++y) {
    for (std::int32_t x = left_; x <= right_; ++x) {
      std::uint8_t& covered = coverage_[static_cast<std::size_t>(y * width_ + x)];
      if (covered == 0) {
        continue;
      }
      std::uint16_t& pixel = pixels_[static_cast<std::size_t>(y * stride_ + x)];
      pixel = blend(pixel, rgb, covered);
      covered = 0;
    }
  }
  left_ = width_;
  top_ = height_;
  right_ = -1;
  bottom_ = -1;
}

void fill(const std::span<std::uint16_t> pixels, const std::int32_t stride,
          const std::int32_t width, const std::int32_t height, const std::uint32_t rgb) {
  const std::uint16_t packed = pack((rgb >> 16U) & kFull, (rgb >> 8U) & kFull, rgb & kFull);
  for (std::int32_t y = 0; y < height; ++y) {
    std::fill_n(pixels.begin() + y * stride, width, packed);
  }
}

void disc(const std::span<std::uint8_t> alpha, const std::int32_t stride, const std::int32_t side,
          const float diameter, const ScreenPoint center) {
  const float radius = diameter / 2.0F;
  for (std::int32_t y = 0; y < side; ++y) {
    for (std::int32_t x = 0; x < side; ++x) {
      const float inside =
          radius + kHalfPixel - std::hypot(static_cast<float>(x) + kHalfPixel - center.x,
                                           static_cast<float>(y) + kHalfPixel - center.y);
      alpha[static_cast<std::size_t>(y * stride + x)] =
          static_cast<std::uint8_t>(std::lround(std::clamp(inside, 0.0F, 1.0F) * kOpaque));
    }
  }
}

}
