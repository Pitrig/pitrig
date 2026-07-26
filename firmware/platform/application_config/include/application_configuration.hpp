#pragma once

#include <array>

#include "delta_time.hpp"
#include "delta_time_widget.hpp"
#include "lap_timer_widget.hpp"

namespace simcore::configuration {

inline constexpr dashboard::RegionId kTimingRegionId = 1;

struct DashboardConfiguration {
  std::array<dashboard::LayoutRegion, 1> regions{};
  dashboard::lap_timer_widget::Config lap_timer{};
  dashboard::delta_time_widget::Config delta_time{};
};

struct ApplicationConfiguration {
  delta_time::Config delta_time{};
  DashboardConfiguration dashboard{};
};

inline constexpr ApplicationConfiguration kApplicationConfiguration{
    .delta_time = {
        .faster_color_rgb = 0x00C853,
        .slower_color_rgb = 0xD50000,
        .neutral_color_rgb = 0xE8E8E8,
        .unavailable_behavior = delta_time::UnavailableBehavior::placeholder,
        .placeholder = {'-', '-', '-', '\0'},
        .scale = {
            .enabled = true,
            .show_sign = true,
            .range_ms = 2'000,
        },
    },
    .dashboard = {
        .regions = {{
            {
                .id = kTimingRegionId,
                .bounds = {.x = 0, .y = 0, .width = 320, .height = 170},
                .padding = {
                    .left = 0,
                    .top = 5,
                    .right = 0,
                    .bottom = 5,
                },
                .style = {
                    .background_color_rgb = 0x000000,
                    .border_color_rgb = 0xAEAEAE,
                    .border_width_px = 1,
                    .radius_px = 0,
                    .visible = false,
                },
            },
        }},
        .lap_timer = {
            .font = {.family = dashboard::FontFamily::lcd, .size_px = 53},
            .placement = {
                .region_id = kTimingRegionId,
                .anchor = dashboard::Anchor::top_center,
                .offset_x = 2,
                .offset_y = 0,
                .width = 320,
                .height = 53,
            },
            .text_color_rgb = 0xE8E8E8,
        },
        .delta_time = {
            .font = {.family = dashboard::FontFamily::lcd, .size_px = 43},
            .placement = {
                .region_id = kTimingRegionId,
                .anchor = dashboard::Anchor::top_center,
                .offset_x = 0,
                .offset_y = 58,
                .height = 61,
            },
            .scale = {
                .vertical_padding_px = 6,
                .border_width_px = 3,
                .border_radius_px = 10,
            },
        },
    },
};

}  // namespace simcore::configuration
