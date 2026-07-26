#pragma once

#include "delta_time.hpp"
#include "delta_time_widget.hpp"
#include "lap_timer_widget.hpp"

namespace simcore::configuration {

struct DashboardConfiguration {
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
        .lap_timer = {
            .block = {.x = 0, .y = 0, .width = 320, .height = 105},
            .font = {.family = dashboard::FontFamily::lcd, .size_px = 80},
            .placement = {
                .anchor = dashboard::Anchor::center,
                .offset_x = 0,
                .offset_y = 0,
            },
            .text_color_rgb = 0xE8E8E8,
        },
        .delta_time = {
            .block = {.x = 0, .y = 105, .width = 320, .height = 65},
            .font = {.family = dashboard::FontFamily::lcd, .size_px = 58},
            .placement = {
                .anchor = dashboard::Anchor::center,
                .offset_x = 0,
                .offset_y = 0,
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
