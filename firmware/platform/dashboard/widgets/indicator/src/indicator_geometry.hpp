#pragma once

#include "indicator_widget.hpp"
#include "lvgl.h"

namespace pitrig::dashboard::indicator_widget::geometry {

struct Ring {
  float radius{};
  std::int32_t centre_x{};
  std::int32_t centre_y{};
};

struct ArcSlices {
  std::int32_t start_deg{};
  std::int32_t length_deg{};
  std::int32_t gap_deg{};
};

[[nodiscard]] Ring resolve_ring(const Config& config, std::int32_t inner_width,
                                std::int32_t inner_height);

[[nodiscard]] ArcSlices resolve_arc(const Config& config, float radius, std::int32_t count);

[[nodiscard]] std::size_t slot_of(const State& state, std::size_t index);

[[nodiscard]] std::int32_t lamp_start_deg(const State& state, std::size_t index);

[[nodiscard]] std::uint16_t outer_radius(const State& state);

[[nodiscard]] lv_area_t lamp_area(const State& state, std::size_t index, const lv_area_t& content);

[[nodiscard]] lv_area_t lamp_arc_area(const State& state, std::size_t index,
                                      const lv_area_t& content);

}
