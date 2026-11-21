#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "track_map_widget.hpp"

namespace pitrig::dashboard::track_map_widget::raster {

class Layer final {
 public:
  Layer(std::span<std::uint16_t> pixels, std::int32_t stride, std::int32_t width,
        std::int32_t height, std::span<std::uint8_t> coverage);

  void segment(ScreenPoint from, ScreenPoint to, float width);
  void paint(std::uint32_t rgb);

 private:
  void cover(std::int32_t x, std::int32_t y, float amount);

  std::span<std::uint16_t> pixels_;
  std::span<std::uint8_t> coverage_;
  std::int32_t stride_{};
  std::int32_t width_{};
  std::int32_t height_{};
  std::int32_t left_{};
  std::int32_t top_{};
  std::int32_t right_{-1};
  std::int32_t bottom_{-1};
};

void fill(std::span<std::uint16_t> pixels, std::int32_t stride, std::int32_t width,
          std::int32_t height, std::uint32_t rgb);

void disc(std::span<std::uint8_t> alpha, std::int32_t stride, std::int32_t side, float diameter,
          ScreenPoint center);

}
