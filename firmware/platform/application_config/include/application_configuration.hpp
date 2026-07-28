#pragma once

#include <array>
#include <cstdint>

#if __has_include("sdkconfig.h")
#include "sdkconfig.h"
#endif
#include "delta_time.hpp"
#include "delta_time_widget.hpp"
#include "estimated_lap_time.hpp"
#include "estimated_lap_time_widget.hpp"
#include "lap_timer.hpp"
#include "lap_timer_widget.hpp"
#include "simcore_features.hpp"
#if SIMCORE_DISPLAY_DIAGNOSTICS
#include "display_diagnostics.hpp"
#endif

namespace simcore::configuration {

inline constexpr dashboard::RegionId kTimingRegionId = 1;

enum class BoardId {
  t_display_s3,
  guition_esp32_4848s040,
};

struct BoardConfiguration {
  BoardId id;
};

enum class TelemetryTransportId {
  board_default,
  native_usb_cdc,
  uart,
};

struct UartTelemetryConfiguration {
  int port;
  int tx_pin;
  int rx_pin;
  std::uint32_t baud_rate;
  bool silence_esp_logs;
};

struct TelemetryTransportConfiguration {
  TelemetryTransportId id;
  UartTelemetryConfiguration uart;
};

enum class DashboardMode {
  normal,
#if SIMCORE_DISPLAY_DIAGNOSTICS
  display_diagnostics,
#endif
};

struct DashboardConfiguration {
  DashboardMode mode{DashboardMode::normal};
#if SIMCORE_DISPLAY_DIAGNOSTICS
  dashboard::display_diagnostics::Config display_diagnostics{};
#endif
  std::array<dashboard::LayoutRegion, 1> regions{};
  dashboard::lap_timer_widget::Config lap_timer{};
  dashboard::delta_time_widget::Config delta_time{};
  dashboard::estimated_lap_time_widget::Config estimated_lap_time{};
};

struct ApplicationConfiguration {
  BoardConfiguration board;
  TelemetryTransportConfiguration telemetry_transport;
  lap_timer::Config lap_timer{};
  delta_time::Config delta_time{};
  estimated_lap_time::Config estimated_lap_time{};
  DashboardConfiguration dashboard{};
};

inline constexpr ApplicationConfiguration kFactoryConfiguration{
    .board = {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
        .id = BoardId::guition_esp32_4848s040,
#else
        .id = BoardId::t_display_s3,
#endif
    },
    .telemetry_transport = {
        .id = TelemetryTransportId::board_default,
        .uart = {
            .port = 0,
            .tx_pin = 43,
            .rx_pin = 44,
            .baud_rate = 115'200,
            .silence_esp_logs = true,
        },
    },
    .lap_timer = {
        .telemetry_only = false,
        .telemetry_timeout_ms = 1'000,
    },
    .delta_time = {
        .unavailable_behavior = delta_time::UnavailableBehavior::zero,
        .placeholder = {'-', '-', '-', '\0'},
        .scale = {
            .enabled = true,
            .show_sign = true,
            .range_ms = 2'000,
        },
    },
    .estimated_lap_time = {
        .unavailable_behavior =
            estimated_lap_time::UnavailableBehavior::placeholder,
        .placeholder = {'-', '-', ':', '-', '-', '.', '-', '-', '-', '\0'},
    },
    .dashboard = {
#if SIMCORE_DISPLAY_DIAGNOSTICS
        .mode = DashboardMode::display_diagnostics,
        .display_diagnostics = {
            .auto_cycle = true,
            .page_duration_ms = 5'000,
            .initial_page = 0,
        },
#else
        .mode = DashboardMode::normal,
#endif
        .regions = {{
            {
                .id = kTimingRegionId,
                .bounds = {.x = 0, .y = 0, .width = 320, .height = 170},
                .padding = {
                    .left = 0,
                    .top = 5,
                    .right = 0,
                    .bottom = 2,
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
            .enabled = true,
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
            .enabled = true,
            .font = {.family = dashboard::FontFamily::lcd, .size_px = 43},
            .placement = {
                .region_id = kTimingRegionId,
                .anchor = dashboard::Anchor::top_center,
                .offset_x = 0,
                .offset_y = 58,
                .height = 61,
            },
            .faster_color_rgb = 0x00C853,
            .slower_color_rgb = 0xD50000,
            .neutral_color_rgb = 0xE8E8E8,
            .scale = {
                .vertical_padding_px = 6,
                .border_width_px = 3,
                .border_radius_px = 10,
            },
        },
        .estimated_lap_time = {
            .enabled = true,
            .font = {.family = dashboard::FontFamily::lcd, .size_px = 39},
            .placement = {
                .region_id = kTimingRegionId,
                .anchor = dashboard::Anchor::bottom_center,
                .offset_x = 0,
                .offset_y = 0,
                .height = 39,
            },
            .text_color_rgb = 0xE8E8E8,
        },
    },
};

}  // namespace simcore::configuration
