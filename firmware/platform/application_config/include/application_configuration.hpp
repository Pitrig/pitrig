#pragma once

#include <array>
#include <cstdint>

#if __has_include("sdkconfig.h")
#include "sdkconfig.h"
#endif
#include "delta_time.hpp"
#include "delta_time_widget.hpp"
#include "driving_aid_widget.hpp"
#include "estimated_lap_time.hpp"
#include "estimated_lap_time_widget.hpp"
#include "fuel_widget.hpp"
#include "gear_widget.hpp"
#include "lap_timer.hpp"
#include "lap_timer_widget.hpp"
#include "race_dashboard_widget.hpp"
#include "rpm_widget.hpp"
#include "simcore_features.hpp"
#include "speed_widget.hpp"
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
  dashboard::gear_widget::Config gear{};
  dashboard::speed_widget::Config speed{};
  dashboard::rpm_widget::Config rpm{};
  dashboard::fuel_widget::LevelConfig fuel{};
  dashboard::fuel_widget::StatisticConfig fuel_average{};
  dashboard::fuel_widget::StatisticConfig fuel_laps_remaining{};
  dashboard::driving_aid_widget::Config traction_control{};
  dashboard::driving_aid_widget::Config abs{};
  dashboard::driving_aid_widget::Config brake_bias{};
  dashboard::race_dashboard_widget::Config race_dashboard{};
};

struct ApplicationConfiguration {
  BoardConfiguration board;
  TelemetryTransportConfiguration telemetry_transport;
  lap_timer::Config lap_timer{};
  delta_time::Config delta_time{};
  estimated_lap_time::Config estimated_lap_time{};
  DashboardConfiguration dashboard{};
};

inline constexpr ApplicationConfiguration
    kFactoryConfiguration{
        .board =
            {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
        .id = BoardId::guition_esp32_4848s040,
#else
        .id = BoardId::t_display_s3,
#endif
    },
        .telemetry_transport =
            {
        .id = TelemetryTransportId::board_default,
                .uart =
                    {
            .port = 0,
            .tx_pin = 43,
            .rx_pin = 44,
            .baud_rate = 115'200,
            .silence_esp_logs = true,
        },
    },
        .lap_timer =
            {
        .telemetry_only = false,
        .telemetry_timeout_ms = 1'000,
    },
        .delta_time =
            {
        .unavailable_behavior = delta_time::UnavailableBehavior::zero,
        .placeholder = {'-', '-', '-', '\0'},
                .scale =
                    {
            .enabled = true,
            .show_sign = true,
            .range_ms = 2'000,
        },
    },
        .estimated_lap_time =
            {
                .unavailable_behavior = estimated_lap_time::UnavailableBehavior::placeholder,
        .placeholder = {'-', '-', ':', '-', '-', '.', '-', '-', '-', '\0'},
    },
        .dashboard =
            {
#if SIMCORE_DISPLAY_DIAGNOSTICS
        .mode = DashboardMode::display_diagnostics,
                .display_diagnostics =
                    {
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
                        .padding =
                            {
                    .left = 0,
                    .top = 5,
                    .right = 0,
                    .bottom = 2,
                },
                        .style =
                            {
                    .background_color_rgb = 0x000000,
                    .border_color_rgb = 0xAEAEAE,
                    .border_width_px = 1,
                    .radius_px = 0,
                    .visible = false,
                },
            },
        }},
                .lap_timer =
                    {
            .enabled = true,
            .font = {.family = dashboard::FontFamily::lcd, .size_px = 53},
                        .placement =
                            {
                .region_id = kTimingRegionId,
                .anchor = dashboard::Anchor::top_center,
                .offset_x = 2,
                .offset_y = 0,
                .width = 320,
                .height = 53,
            },
            .text_color_rgb = 0xE8E8E8,
        },
                .delta_time =
                    {
            .enabled = true,
            .font = {.family = dashboard::FontFamily::lcd, .size_px = 43},
                        .placement =
                            {
                .region_id = kTimingRegionId,
                .anchor = dashboard::Anchor::top_center,
                .offset_x = 0,
                .offset_y = 58,
                .height = 61,
            },
            .faster_color_rgb = 0x00C853,
            .slower_color_rgb = 0xD50000,
            .neutral_color_rgb = 0xE8E8E8,
                        .scale =
                            {
                .vertical_padding_px = 6,
                .border_width_px = 3,
                .border_radius_px = 10,
            },
        },
                .estimated_lap_time =
                    {
            .enabled = true,
            .font = {.family = dashboard::FontFamily::lcd, .size_px = 39},
                        .placement =
                            {
                .region_id = kTimingRegionId,
                .anchor = dashboard::Anchor::bottom_center,
                .offset_x = 0,
                .offset_y = 0,
                .height = 39,
            },
            .text_color_rgb = 0xE8E8E8,
        },
                .gear =
                    {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
            .enabled = true,
#else
            .enabled = false,
#endif
                        .font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 48,
            },
                        .placement =
                            {
                .region_id = dashboard::kScreenRegionId,
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
                .anchor = dashboard::Anchor::top_right,
                .offset_x = -16,
#else
                .anchor = dashboard::Anchor::top_center,
                .offset_x = 0,
#endif
                .offset_y = 16,
                .width = 120,
                .height = 120,
            },
                        .padding =
                            {
                .left = 8,
                .top = 8,
                .right = 8,
                .bottom = 8,
            },
                        .border =
                            {
                .color_rgb = 0xAEAEAE,
                .width_px = 2,
                .radius_px = 12,
            },
            .text_color_rgb = 0xE8E8E8,
            .background_color_rgb = 0x0B0B0B,
        },
                .speed =
                    {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
            .enabled = true,
#else
            .enabled = false,
#endif
                        .font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 48,
            },
                        .placement =
                            {
                .region_id = dashboard::kScreenRegionId,
                .anchor = dashboard::Anchor::bottom_center,
                .offset_x = 0,
                .offset_y = -24,
                .width = 180,
                .height = 64,
            },
            .text_color_rgb = 0xE8E8E8,
        },
                .rpm =
                    {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
            .enabled = true,
#else
            .enabled = false,
#endif
                        .font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 48,
            },
                        .placement =
                            {
                .region_id = dashboard::kScreenRegionId,
                .anchor = dashboard::Anchor::bottom_center,
                .offset_x = 0,
                .offset_y = -96,
                .width = 320,
                .height = 64,
            },
            .text_color_rgb = 0xE8E8E8,
        },
                .fuel =
                    {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
            .enabled = true,
#else
            .enabled = false,
#endif
                        .font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 24,
            },
                        .placement =
                            {
                .region_id = dashboard::kScreenRegionId,
                .anchor = dashboard::Anchor::bottom_left,
                .offset_x = 16,
                .offset_y = -24,
                .width = 126,
                .height = 64,
            },
            .text_color_rgb = 0xE8E8E8,
        },
                .fuel_average =
                    {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
            .enabled = true,
#else
            .enabled = false,
#endif
                        .font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 24,
            },
                        .placement =
                            {
                .region_id = dashboard::kScreenRegionId,
                .anchor = dashboard::Anchor::bottom_right,
                .offset_x = -16,
                .offset_y = -62,
                .width = 126,
                .height = 30,
            },
            .text_color_rgb = 0xE8E8E8,
        },
                .fuel_laps_remaining =
                    {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
            .enabled = true,
#else
            .enabled = false,
#endif
                        .font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 24,
            },
                        .placement =
                            {
                .region_id = dashboard::kScreenRegionId,
                .anchor = dashboard::Anchor::bottom_right,
                .offset_x = -16,
                .offset_y = -24,
                .width = 126,
                .height = 30,
            },
            .text_color_rgb = 0xE8E8E8,
        },
                .traction_control =
                    {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
            .enabled = true,
#else
            .enabled = false,
#endif
                        .label_font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 10,
            },
                        .value_font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 48,
            },
            .label_offset_y_px = 0,
                        .placement =
                            {
                .region_id = dashboard::kScreenRegionId,
                .anchor = dashboard::Anchor::top_left,
                .offset_x = 92,
                .offset_y = 16,
                .width = 72,
                .height = 72,
            },
            .padding = {.left = 4, .top = 4, .right = 4, .bottom = 4},
                        .border =
                            {
                .color_rgb = 0x00E5FF,
                .width_px = 3,
                .radius_px = 8,
            },
            .label_color_rgb = 0xE8E8E8,
            .value_color_rgb = 0xE8E8E8,
            .background_color_rgb = 0x000000,
        },
                .abs =
                    {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
            .enabled = true,
#else
            .enabled = false,
#endif
                        .label_font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 10,
            },
                        .value_font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 48,
            },
            .label_offset_y_px = 0,
                        .placement =
                            {
                .region_id = dashboard::kScreenRegionId,
                .anchor = dashboard::Anchor::top_left,
                .offset_x = 16,
                .offset_y = 16,
                .width = 72,
                .height = 72,
            },
            .padding = {.left = 4, .top = 4, .right = 4, .bottom = 4},
                        .border =
                            {
                .color_rgb = 0xF5F500,
                .width_px = 3,
                .radius_px = 8,
            },
            .label_color_rgb = 0xE8E8E8,
            .value_color_rgb = 0xE8E8E8,
            .background_color_rgb = 0x000000,
        },
                .brake_bias =
                    {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
            .enabled = true,
#else
            .enabled = false,
#endif
                        .label_font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 10,
            },
                        .value_font =
                            {
                .family = dashboard::FontFamily::montserrat,
                .size_px = 48,
            },
            .label_offset_y_px = 0,
                        .placement =
                            {
                .region_id = dashboard::kScreenRegionId,
                .anchor = dashboard::Anchor::top_left,
                .offset_x = 168,
                .offset_y = 16,
                .width = 104,
                .height = 72,
            },
            .padding = {.left = 4, .top = 4, .right = 4, .bottom = 4},
                        .border =
                            {
                .color_rgb = 0xF000D0,
                .width_px = 3,
                .radius_px = 8,
            },
            .label_color_rgb = 0xE8E8E8,
            .value_color_rgb = 0xE8E8E8,
            .background_color_rgb = 0x000000,
        },
                .race_dashboard =
                    {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
                        .enabled = true,
#else
                        .enabled = false,
#endif
                        .variant = dashboard::race_dashboard_widget::LayoutVariant::compact,
                        .placement =
                            {
                                .region_id = dashboard::kScreenRegionId,
                                .anchor = dashboard::Anchor::center,
                                .width = 480,
                                .height = 480,
                            },
                    },
    },
};

}  // namespace simcore::configuration
