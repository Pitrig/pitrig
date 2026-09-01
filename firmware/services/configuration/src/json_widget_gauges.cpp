#include <array>
#include <cstddef>
#include <string_view>

#include "configuration_schema_generated.hpp"
#include "json_readers.hpp"
#include "json_value_pipeline.hpp"
#include "json_widget_variants_internal.hpp"
#include "json_widgets.hpp"

namespace simcore::configuration::json::variants {

[[nodiscard]] bool parse_bar_widget(const cJSON* const object,
                                    BarWidgetConfiguration& config,
                                    ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.bar";
  if (!valid_object(object, schema::kBarWidgetConfigurationKeys, kName,
                    failure) ||
      !parse_frame(object, config.frame, kName, failure) ||
      !parse_value_source(object, "source", config.source, kName, failure) ||
      !read_float(object, "minimum", config.range.minimum, kName, failure) ||
      !read_float(object, "maximum", config.range.maximum, kName, failure) ||
      !read_float(object, "origin", config.origin, kName, failure) ||
      !read_enum(object, "orientation", config.orientation,
                 bar_orientation_from_name, kName, failure) ||
      !read_boolean(object, "inverted", config.inverted, kName, failure) ||
      !read_color(object, "fill_color", config.fill_color, kName, failure) ||
      !read_color(object, "fill_grad_color", config.fill_grad_color, kName,
                  failure)) {
    return false;
  }
  config.origin_present = member(object, "origin") != nullptr;
  return true;
}

[[nodiscard]] bool parse_arc_widget(const cJSON* const object,
                                    ArcWidgetConfiguration& config,
                                    ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.arc";
  return valid_object(object, schema::kArcWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         parse_value_source(object, "source", config.source, kName, failure) &&
         read_float(object, "minimum", config.range.minimum, kName, failure) &&
         read_float(object, "maximum", config.range.maximum, kName, failure) &&
         read_integer(object, "start_angle_deg", config.start_angle_deg, kName,
                      failure) &&
         read_integer(object, "sweep_deg", config.sweep_deg, kName, failure) &&
         read_integer(object, "thickness_px", config.thickness_px, kName,
                      failure) &&
         read_integer(object, "radius_px", config.radius_px, kName, failure) &&
         read_integer(object, "center_x_px", config.center_x_px, kName,
                      failure) &&
         read_integer(object, "center_y_px", config.center_y_px, kName,
                      failure) &&
         read_color(object, "track_color", config.track_color, kName,
                    failure) &&
         read_color(object, "fill_color", config.fill_color, kName, failure) &&
         read_enum(object, "mark", config.mark, arc_mark_from_name, kName,
                   failure) &&
         read_boolean(object, "inverted", config.inverted, kName, failure);
}

[[nodiscard]] bool parse_indicator_segments(const cJSON* const object,
                                            IndicatorWidgetConfiguration& config,
                                            ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.indicator.segments";
  return read_array(
      object, "segments", config.segments, config.segment_count, kName,
      ValidationError::malformed, failure,
      [&](const cJSON* const segment, IndicatorSegment& parsed) {
        return valid_object(segment, schema::kIndicatorSegmentKeys, kName,
                            failure) &&
               read_float(segment, "threshold", parsed.threshold, kName,
                          failure) &&
               read_color(segment, "color", parsed.color, kName, failure);
      });
}

[[nodiscard]] bool parse_indicator_widget(const cJSON* const object,
                                          IndicatorWidgetConfiguration& config,
                                          ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.indicator";
  return valid_object(object, schema::kIndicatorWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         parse_value_source(object, "source", config.source, kName, failure) &&
         read_float(object, "minimum", config.range.minimum, kName, failure) &&
         read_float(object, "maximum", config.range.maximum, kName, failure) &&
         read_enum(object, "shape", config.shape, indicator_shape_from_name,
                   kName, failure) &&
         read_enum(object, "orientation", config.orientation,
                   bar_orientation_from_name, kName, failure) &&
         read_integer(object, "start_angle_deg", config.start_angle_deg, kName,
                      failure) &&
         read_integer(object, "sweep_deg", config.sweep_deg, kName, failure) &&
         read_integer(object, "thickness_px", config.thickness_px, kName,
                      failure) &&
         read_integer(object, "radius_px", config.radius_px, kName, failure) &&
         read_integer(object, "center_x_px", config.center_x_px, kName,
                      failure) &&
         read_integer(object, "center_y_px", config.center_y_px, kName,
                      failure) &&
         read_integer(object, "segment_gap_px", config.segment_gap_px, kName,
                      failure) &&
         read_integer(object, "segment_radius_px", config.segment_radius_px,
                      kName, failure) &&
         read_boolean(object, "inverted", config.inverted, kName, failure) &&
         read_color(object, "off_color", config.off_color, kName, failure) &&
         read_float(object, "blink_threshold", config.blink_threshold, kName,
                    failure) &&
         read_integer(object, "blink_ms", config.blink_ms, kName, failure) &&
         parse_indicator_segments(object, config, failure);
}

[[nodiscard]] bool parse_graph_traces(const cJSON* const object,
                                      GraphWidgetConfiguration& config,
                                      ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.graph.traces";
  return read_array(
      object, "traces", config.traces, config.trace_count, kName,
      ValidationError::malformed, failure,
      [&](const cJSON* const trace, GraphTraceConfiguration& parsed) {
        return valid_object(trace, schema::kGraphTraceConfigurationKeys, kName,
                            failure) &&
               parse_value_source(trace, "source", parsed.source, kName, failure) &&
               read_float(trace, "minimum", parsed.range.minimum, kName,
                          failure) &&
               read_float(trace, "maximum", parsed.range.maximum, kName,
                          failure) &&
               read_color(trace, "line_color", parsed.line_color, kName,
                          failure);
      });
}

[[nodiscard]] bool parse_graph_widget(const cJSON* const object,
                                      GraphWidgetConfiguration& config,
                                      ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.graph";
  return valid_object(object, schema::kGraphWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         parse_value_source(object, "source", config.source, kName, failure) &&
         read_float(object, "minimum", config.range.minimum, kName, failure) &&
         read_float(object, "maximum", config.range.maximum, kName, failure) &&
         read_integer(object, "point_count", config.point_count, kName,
                      failure) &&
         read_integer(object, "sample_interval_ms", config.sample_interval_ms,
                      kName, failure) &&
         read_color(object, "line_color", config.line_color, kName, failure) &&
         read_integer(object, "line_width_px", config.line_width_px, kName,
                      failure) &&
         parse_graph_traces(object, config, failure);
}

}
