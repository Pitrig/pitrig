#include "arc_gradient.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstring>
#include <numbers>

#include "logger.hpp"

namespace pitrig::dashboard::arc_widget::gradient {
namespace {

constexpr char kTag[] = "arc_gradient";

constexpr float kEdgeMarginPx = 2.0F;

constexpr std::size_t kRampSteps = 256;

using RampTable = std::array<lv_color_t, kRampSteps>;

void write_pixel(std::uint8_t* const pixel, const lv_color_t colour) {
  if constexpr (LV_COLOR_DEPTH == 16) {
    const std::uint16_t packed = lv_color_to_u16(colour);
    std::memcpy(pixel, &packed, sizeof packed);
  } else if constexpr (LV_COLOR_DEPTH == 24) {
    std::memcpy(pixel, &colour, sizeof colour);
  } else {
    const std::uint32_t packed = lv_color_to_u32(colour);
    std::memcpy(pixel, &packed, sizeof packed);
  }
}

[[nodiscard]] RampTable ramp_table(const Ramp& ramp) {
  RampTable table{};
  for (std::size_t step = 0; step < kRampSteps; ++step) {
    const double ratio =
        static_cast<double>(step) / static_cast<double>(kRampSteps - 1);
    table[step] = lv_color_hex(
        fill::color_at(ramp.colours, static_cast<float>(ratio)));
  }
  return table;
}

[[nodiscard]] float fraction_at(const Ramp& ramp, const float dx,
                                const float dy) {
  const float degrees =
      std::atan2(dy, dx) * 180.0F / std::numbers::pi_v<float>;
  const float travelled =
      std::fmod(degrees - ramp.start_deg + 720.0F, 360.0F);
  float fraction{};
  if (travelled <= ramp.sector_deg) {
    fraction = travelled / ramp.sector_deg;
  } else {
    const float past_end = travelled - ramp.sector_deg;
    fraction = past_end * 2.0F < 360.0F - ramp.sector_deg ? 1.0F : 0.0F;
  }
  return ramp.inverted ? 1.0F - fraction : fraction;
}

[[nodiscard]] const lv_color_t& ramp_colour(const RampTable& table,
                                            const float fraction) {
  const auto step = static_cast<std::size_t>(
      std::clamp(fraction, 0.0F, 1.0F) * static_cast<float>(kRampSteps - 1) +
      0.5F);
  return table[std::min(step, kRampSteps - 1)];
}

}

lv_draw_buf_t* prepare(const Ramp& ramp) {
  if (ramp.side <= 0 || ramp.sector_deg <= 0.0F) {
    return nullptr;
  }
  const auto side = static_cast<std::uint32_t>(ramp.side);
  lv_draw_buf_t* const buffer =
      lv_draw_buf_create(side, side, LV_COLOR_FORMAT_NATIVE, LV_STRIDE_AUTO);
  if (buffer == nullptr) {
    log::error(kTag, "No memory for a %d px arc gradient",
               static_cast<int>(ramp.side));
    return nullptr;
  }
  lv_draw_buf_clear(buffer, nullptr);
  const RampTable table = ramp_table(ramp);
  const auto centre = static_cast<float>(ramp.side / 2);
  const float outer = static_cast<float>(ramp.side) / 2.0F + kEdgeMarginPx;
  const float inner =
      std::max(static_cast<float>(ramp.side) / 2.0F -
                   static_cast<float>(ramp.thickness_px) - kEdgeMarginPx,
               0.0F);
  const float outer_squared = outer * outer;
  const float inner_squared = inner * inner;
  const std::size_t pixel_bytes =
      lv_color_format_get_size(LV_COLOR_FORMAT_NATIVE);
  for (std::int32_t y = 0; y < ramp.side; ++y) {
    std::uint8_t* const row =
        buffer->data + static_cast<std::size_t>(y) * buffer->header.stride;
    const float dy = static_cast<float>(y) - centre;
    for (std::int32_t x = 0; x < ramp.side; ++x) {
      const float dx = static_cast<float>(x) - centre;
      const float distance_squared = dx * dx + dy * dy;
      if (distance_squared > outer_squared ||
          distance_squared < inner_squared) {
        continue;
      }
      write_pixel(row + static_cast<std::size_t>(x) * pixel_bytes,
                  ramp_colour(table, fraction_at(ramp, dx, dy)));
    }
  }
  return buffer;
}

}
