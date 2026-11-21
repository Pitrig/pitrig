#include <string_view>

#include "configuration_schema_generated.hpp"
#include "json_readers.hpp"
#include "json_value_pipeline.hpp"
#include "json_widget_variants_internal.hpp"
#include "json_widgets.hpp"

namespace pitrig::configuration::json::variants {
namespace {

[[nodiscard]] bool parse_track_colors(const cJSON* const object,
                                      TrackMapWidgetConfiguration& config,
                                      const std::string_view name, ValidationFailure& failure) {
  return read_color(object, "line_color", config.line_color, name, failure) &&
         read_integer(object, "line_width_px", config.line_width_px, name, failure) &&
         read_color(object, "sector_1_color", config.sector_1_color, name, failure) &&
         read_color(object, "sector_2_color", config.sector_2_color, name, failure) &&
         read_color(object, "sector_3_color", config.sector_3_color, name, failure) &&
         read_color(object, "pit_lane_color", config.pit_lane_color, name, failure) &&
         read_color(object, "finish_line_color", config.finish_line_color, name, failure);
}

[[nodiscard]] bool parse_car_colors(const cJSON* const object, TrackMapWidgetConfiguration& config,
                                    const std::string_view name, ValidationFailure& failure) {
  return read_color(object, "car_color", config.car_color, name, failure) &&
         read_integer(object, "car_size_px", config.car_size_px, name, failure) &&
         read_color(object, "player_color", config.player_color, name, failure) &&
         read_integer(object, "player_size_px", config.player_size_px, name, failure) &&
         read_color(object, "player_border_color", config.player_border_color, name, failure) &&
         read_color(object, "ahead_color", config.ahead_color, name, failure) &&
         read_color(object, "behind_color", config.behind_color, name, failure) &&
         read_color(object, "lapping_color", config.lapping_color, name, failure) &&
         read_color(object, "lapped_color", config.lapped_color, name, failure) &&
         read_color(object, "pit_car_color", config.pit_car_color, name, failure) &&
         read_color(object, "class_1_color", config.class_1_color, name, failure) &&
         read_color(object, "class_2_color", config.class_2_color, name, failure) &&
         read_color(object, "class_3_color", config.class_3_color, name, failure) &&
         read_color(object, "class_4_color", config.class_4_color, name, failure);
}

}

bool parse_track_map_widget(const cJSON* const object, TrackMapWidgetConfiguration& config,
                            ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.track_map";
  return valid_object(object, schema::kTrackMapWidgetConfigurationKeys, kName, failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         parse_track_colors(object, config, kName, failure) &&
         parse_car_colors(object, config, kName, failure) &&
         read_boolean(object, "fit_rotation", config.fit_rotation, kName, failure) &&
         read_integer(object, "rotation_deg", config.rotation_deg, kName, failure) &&
         read_integer(object, "refresh_ms", config.refresh_ms, kName, failure);
}

}
