#pragma once

#include <array>
#include <cstdint>

#if __has_include("sdkconfig.h")
#include "sdkconfig.h"
#endif
#include "delta_time.hpp"
#include "delta_time_widget.hpp"
#include "lap_timer.hpp"
#include "lap_timer_widget.hpp"
#include "simcore_features.hpp"
#include "text_widget.hpp"
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
  std::uint8_t text_widget_count{};
  std::array<dashboard::text_widget::Config,
             dashboard::text_widget::kMaximumInstances>
      text_widgets{};
};

struct ApplicationConfiguration {
  BoardConfiguration board;
  TelemetryTransportConfiguration telemetry_transport;
  lap_timer::Config lap_timer{};
  delta_time::Config delta_time{};
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
                .bounds = {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
                    .x = 80,
                    .y = 155,
#else
                    .x = 0,
                    .y = 0,
#endif
                    .width = 320,
                    .height = 170,
                },
                .padding = {
                    .left = 0,
                    .top = 5,
                    .right = 0,
                    .bottom = 2,
                },
                .style = {
                    .background_color = 0x000000,
                    .border_color = 0xAEAEAE,
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
            .text_color = 0xE8E8E8,
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
            .faster_color = 0x00C853,
            .slower_color = 0xD50000,
            .neutral_color = 0xE8E8E8,
            .scale = {
                .vertical_padding_px = 6,
                .border_width_px = 3,
                .border_radius_px = 10,
            },
        },
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
        .text_widget_count = 10,
        .text_widgets = {{
            {
                .binding = telemetry::make_field_name(
                    telemetry::fields::kEstimatedLapTime),
                .placement = {
                    .region_id = kTimingRegionId,
                    .anchor = dashboard::Anchor::bottom_center,
                    .height = 39,
                },
                .value = {
                    .font = {
                        .family = dashboard::FontFamily::lcd,
                        .size_px = 39,
                    },
                    .unavailable_text = {
                        '-', '-', ':', '-', '-', '.', '-', '-', '-', '\0'},
                },
            },
            {
                .binding = telemetry::make_field_name(
                    telemetry::fields::kGear),
                .placement = {
                    .region_id = dashboard::kScreenRegionId,
                    .anchor = dashboard::Anchor::top_right,
                    .offset_x = -16,
                    .offset_y = 16,
                    .width = 120,
                    .height = 120,
                },
                .padding = {.left = 8, .top = 8, .right = 8, .bottom = 8},
                .border = {
                    .color = 0xAEAEAE,
                    .width_px = 2,
                    .radius_px = 12,
                },
                .background_color = 0x0B0B0B,
            },
            {
                .binding = telemetry::make_field_name(
                    telemetry::fields::kSpeed),
                .placement = {
                    .region_id = dashboard::kScreenRegionId,
                    .anchor = dashboard::Anchor::bottom_center,
                    .offset_y = -24,
                    .width = 180,
                    .height = 64,
                },
            },
            {
                .binding = telemetry::make_field_name(
                    telemetry::fields::kRpm),
                .placement = {
                    .region_id = dashboard::kScreenRegionId,
                    .anchor = dashboard::Anchor::bottom_center,
                    .offset_y = -96,
                    .width = 320,
                    .height = 64,
                },
            },
            {
                .binding = telemetry::make_field_name(
                    telemetry::fields::kFuelLevel),
                .placement = {
                    .region_id = dashboard::kScreenRegionId,
                    .anchor = dashboard::Anchor::bottom_left,
                    .offset_x = 16,
                    .offset_y = -24,
                    .width = 126,
                    .height = 64,
                },
                .value = {
                    .font = {
                        .family = dashboard::FontFamily::montserrat,
                        .size_px = 24,
                    },
                },
            },
            {
                .binding = telemetry::make_field_name(
                    telemetry::fields::kFuelAverageConsumption),
                .placement = {
                    .region_id = dashboard::kScreenRegionId,
                    .anchor = dashboard::Anchor::bottom_right,
                    .offset_x = -16,
                    .offset_y = -62,
                    .width = 126,
                    .height = 30,
                },
                .value = {
                    .font = {
                        .family = dashboard::FontFamily::montserrat,
                        .size_px = 24,
                    },
                },
            },
            {
                .binding = telemetry::make_field_name(
                    telemetry::fields::kFuelLapsRemaining),
                .placement = {
                    .region_id = dashboard::kScreenRegionId,
                    .anchor = dashboard::Anchor::bottom_right,
                    .offset_x = -16,
                    .offset_y = -24,
                    .width = 126,
                    .height = 30,
                },
                .value = {
                    .font = {
                        .family = dashboard::FontFamily::montserrat,
                        .size_px = 24,
                    },
                },
            },
            {
                .binding = telemetry::make_field_name(
                    telemetry::fields::kTractionControl),
                .placement = {
                    .region_id = dashboard::kScreenRegionId,
                    .anchor = dashboard::Anchor::top_left,
                    .offset_x = 92,
                    .offset_y = 16,
                    .width = 72,
                    .height = 72,
                },
                .padding = {.left = 4, .top = 4, .right = 4, .bottom = 4},
                .border = {
                    .color = 0x00E5FF,
                    .width_px = 3,
                    .radius_px = 8,
                },
                .title = {
                    .text = {'T', 'C', '\0'},
                },
            },
            {
                .binding = telemetry::make_field_name(
                    telemetry::fields::kAbs),
                .placement = {
                    .region_id = dashboard::kScreenRegionId,
                    .anchor = dashboard::Anchor::top_left,
                    .offset_x = 16,
                    .offset_y = 16,
                    .width = 72,
                    .height = 72,
                },
                .padding = {.left = 4, .top = 4, .right = 4, .bottom = 4},
                .border = {
                    .color = 0xF5F500,
                    .width_px = 3,
                    .radius_px = 8,
                },
                .title = {
                    .text = {'A', 'B', 'S', '\0'},
                },
            },
            {
                .binding = telemetry::make_field_name(
                    telemetry::fields::kBrakeBias),
                .placement = {
                    .region_id = dashboard::kScreenRegionId,
                    .anchor = dashboard::Anchor::top_left,
                    .offset_x = 168,
                    .offset_y = 16,
                    .width = 104,
                    .height = 72,
                },
                .padding = {.left = 4, .top = 4, .right = 4, .bottom = 4},
                .border = {
                    .color = 0xF000D0,
                    .width_px = 3,
                    .radius_px = 8,
                },
                .title = {
                    .text = {'B', 'I', 'A', 'S', '\0'},
                },
            },
        }},
#else
        .text_widget_count = 0,
        .text_widgets = {},
#endif
    },
};

}  // namespace simcore::configuration
