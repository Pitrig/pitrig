#pragma once

#include <cstdint>

#include "dashboard_layout.hpp"

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::dashboard::driving_aid_widget {

enum class Kind : std::uint8_t {
  traction_control,
  abs,
  brake_bias,
};

struct Border {
  std::uint32_t color_rgb{0x00E5FF};
  std::uint16_t width_px{3};
  std::uint16_t radius_px{8};
};

struct Config {
  bool enabled{};
  FontSpec label_font{
      .family = FontFamily::montserrat,
      .size_px = 10,
  };
  FontSpec value_font{
      .family = FontFamily::montserrat,
      .size_px = 48,
  };
  std::int16_t label_offset_y_px{};
  Placement placement{
      .region_id = kScreenRegionId,
      .anchor = Anchor::top_left,
      .offset_x = 16,
      .offset_y = 16,
      .width = 72,
      .height = 72,
  };
  Insets padding{.left = 4, .top = 4, .right = 4, .bottom = 4};
  Border border{};
  std::uint32_t label_color_rgb{0xE8E8E8};
  std::uint32_t value_color_rgb{0xE8E8E8};
  std::uint32_t background_color_rgb{0x000000};
};

// Creates one fixed-kind telemetry card. TC and ABS show integer levels;
// brake bias shows a percentage with one fractional digit.
[[nodiscard]] bool create(const Layout& layout, const Config& config, Kind kind,
                          const telemetry::ITelemetryReader& telemetry);

}  // namespace simcore::dashboard::driving_aid_widget
