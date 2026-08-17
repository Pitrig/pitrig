#include "json_widgets.hpp"

#include <array>
#include <cstddef>
#include <string_view>

#include "configuration_schema_generated.hpp"
#include "json_readers.hpp"
#include "json_value_pipeline.hpp"

namespace simcore::configuration::json {
namespace {

[[nodiscard]] bool parse_bar_widget(const cJSON* const object,
                                    BarWidgetConfiguration& config,
                                    ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.bar";
  if (!valid_object(object, schema::kBarWidgetConfigurationKeys, kName,
                    failure) ||
      !parse_frame(object, config.frame, kName, failure) ||
      !parse_value_source(object, config.source, kName, failure) ||
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
  // An omitted origin means the low end of the range, which a literal zero
  // cannot express once the window goes negative.
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
         parse_value_source(object, config.source, kName, failure) &&
         read_float(object, "minimum", config.range.minimum, kName, failure) &&
         read_float(object, "maximum", config.range.maximum, kName, failure) &&
         read_integer(object, "start_angle_deg", config.start_angle_deg, kName,
                      failure) &&
         read_integer(object, "sweep_deg", config.sweep_deg, kName, failure) &&
         read_integer(object, "thickness_px", config.thickness_px, kName,
                      failure) &&
         read_color(object, "track_color", config.track_color, kName,
                    failure) &&
         read_color(object, "fill_color", config.fill_color, kName, failure) &&
         read_boolean(object, "inverted", config.inverted, kName, failure);
}

[[nodiscard]] bool parse_indicator_segments(const cJSON* const object,
                                            IndicatorWidgetConfiguration& config,
                                            ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.indicator.segments";
  const cJSON* const segments = member(object, "segments");
  if (segments == nullptr) {
    return true;
  }
  const int count =
      cJSON_IsArray(segments) ? cJSON_GetArraySize(segments) : -1;
  if (count < 0 || count > static_cast<int>(config.segments.size())) {
    return reject(failure, ValidationError::malformed, kName);
  }
  for (int index = 0; index < count; ++index) {
    const cJSON* const segment = cJSON_GetArrayItem(segments, index);
    IndicatorSegment& parsed = config.segments[index];
    if (!valid_object(segment, schema::kIndicatorSegmentKeys, kName, failure) ||
        !read_float(segment, "threshold", parsed.threshold, kName, failure) ||
        !read_color(segment, "color", parsed.color, kName, failure)) {
      return false;
    }
  }
  config.segment_count = static_cast<std::uint8_t>(count);
  return true;
}

[[nodiscard]] bool parse_indicator_widget(const cJSON* const object,
                                          IndicatorWidgetConfiguration& config,
                                          ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.indicator";
  return valid_object(object, schema::kIndicatorWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         parse_value_source(object, config.source, kName, failure) &&
         read_float(object, "minimum", config.range.minimum, kName, failure) &&
         read_float(object, "maximum", config.range.maximum, kName, failure) &&
         read_enum(object, "orientation", config.orientation,
                   bar_orientation_from_name, kName, failure) &&
         read_integer(object, "segment_gap_px", config.segment_gap_px, kName,
                      failure) &&
         read_integer(object, "segment_radius_px", config.segment_radius_px,
                      kName, failure) &&
         read_color(object, "off_color", config.off_color, kName, failure) &&
         read_float(object, "blink_threshold", config.blink_threshold, kName,
                    failure) &&
         read_integer(object, "blink_ms", config.blink_ms, kName, failure) &&
         parse_indicator_segments(object, config, failure);
}

[[nodiscard]] bool parse_graph_widget(const cJSON* const object,
                                      GraphWidgetConfiguration& config,
                                      ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.graph";
  return valid_object(object, schema::kGraphWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         parse_value_source(object, config.source, kName, failure) &&
         read_float(object, "minimum", config.range.minimum, kName, failure) &&
         read_float(object, "maximum", config.range.maximum, kName, failure) &&
         read_integer(object, "point_count", config.point_count, kName,
                      failure) &&
         read_integer(object, "sample_interval_ms", config.sample_interval_ms,
                      kName, failure) &&
         read_color(object, "line_color", config.line_color, kName, failure) &&
         read_integer(object, "line_width_px", config.line_width_px, kName,
                      failure);
}

[[nodiscard]] bool parse_image_widget(const cJSON* const object,
                                      ImageWidgetConfiguration& config,
                                      ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.image";
  return valid_object(object, schema::kImageWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         read_text(object, "image", config.image, kName, failure) &&
         read_color(object, "recolor", config.recolor, kName, failure) &&
         read_integer(object, "recolor_opa", config.recolor_opa, kName,
                      failure);
}

[[nodiscard]] bool parse_shape_widget(const cJSON* const object,
                                      ShapeWidgetConfiguration& config,
                                      ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.shape";
  return valid_object(object, schema::kShapeWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         read_enum(object, "kind", config.kind, shape_kind_from_name, kName,
                   failure);
}

[[nodiscard]] bool parse_text_widget(const cJSON* const object,
                                     TextWidgetConfiguration& config,
                                     ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text";
  if (!valid_object(object, schema::kTextWidgetConfigurationKeys, kName,
                    failure) ||
      !parse_frame(object, config.frame, kName, failure) ||
      !parse_sources(object, config, failure)) {
    return false;
  }

  const cJSON* const value = member(object, "value");
  if (value == nullptr) {
    return true;
  }
  constexpr std::string_view kValueName = "widget.text.value";
  return valid_object(value, schema::kWidgetValueStyleKeys, kValueName,
                      failure) &&
         parse_optional_font(value, config.value.font, failure) &&
         read_color(value, "color", config.value.color, kValueName, failure) &&
         read_text(value, "unavailable_text", config.value.unavailable_text,
                   kValueName, failure) &&
         read_enum(value, "alignment", config.value.alignment,
                   text_alignment_from_name, kValueName, failure);
}

// Fills one instance of one variant. Indexed by the discriminator exactly as
// the generated traits table is, so the two stay aligned by construction.
// Storage bookkeeping — capacity, index, count — belongs to the traits table;
// an entry here only knows how to fill its own variant.
using WidgetParser = bool (*)(const cJSON*, DashboardConfiguration&,
                              std::uint8_t index, ValidationFailure&);

constexpr std::array<WidgetParser, kWidgetTypeTraits.size()> kWidgetParsers{{
    [](const cJSON* const object, DashboardConfiguration& dashboard,
       const std::uint8_t index, ValidationFailure& failure) {
      return parse_text_widget(object, dashboard.text_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard,
       const std::uint8_t index, ValidationFailure& failure) {
      return parse_shape_widget(object, dashboard.shape_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard,
       const std::uint8_t index, ValidationFailure& failure) {
      return parse_bar_widget(object, dashboard.bar_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard,
       const std::uint8_t index, ValidationFailure& failure) {
      return parse_arc_widget(object, dashboard.arc_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard,
       const std::uint8_t index, ValidationFailure& failure) {
      return parse_indicator_widget(object, dashboard.indicator_widgets[index],
                                    failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard,
       const std::uint8_t index, ValidationFailure& failure) {
      return parse_graph_widget(object, dashboard.graph_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard,
       const std::uint8_t index, ValidationFailure& failure) {
      return parse_image_widget(object, dashboard.image_widgets[index], failure);
    },
}};

}  // namespace

bool parse_widget(const cJSON* const object, DashboardConfiguration& dashboard,
                  const ReferenceTable& owner, const std::uint8_t screen_index,
                  const std::uint8_t group_index, const bool group_present,
                  ValidationFailure& failure) {
  constexpr std::string_view kName = "widget";
  if (!cJSON_IsObject(object)) {
    return reject(failure, ValidationError::invalid_widget, kName);
  }
  const cJSON* const type = member(object, "type");
  WidgetType widget_type{};
  if (!cJSON_IsString(type) || type->valuestring == nullptr ||
      !widget_type_from_name(std::string_view{type->valuestring},
                             widget_type)) {
    return reject(failure, ValidationError::invalid_widget, kName, "type");
  }
  if (*owner.count >= owner.entries.size()) {
    return group_present
               ? reject(failure, ValidationError::invalid_group, "group",
                        "widgets")
               : reject(failure, ValidationError::invalid_screen, "screen",
                        "widgets");
  }

  const WidgetTypeTraits& traits = widget_traits(widget_type);
  const std::uint8_t storage_index = traits.count(dashboard);
  if (storage_index >= traits.capacity) {
    return reject(failure, ValidationError::invalid_dashboard, "dashboard",
                  traits.storage_key);
  }
  if (!kWidgetParsers[static_cast<std::size_t>(widget_type)](
          object, dashboard, storage_index, failure)) {
    return false;
  }
  // Counted first, because the traits table refuses to hand out a frame past
  // the count — which is exactly what keeps every other caller in range.
  traits.set_count(dashboard, static_cast<std::uint8_t>(storage_index + 1));

  // Parenting is stamped once after the variant is parsed, so a widget type
  // knows nothing about screens or groups.
  WidgetFrame* const frame = traits.mutable_frame(dashboard, storage_index);
  frame->screen_index = screen_index;
  frame->group_index = group_index;
  frame->group_present = group_present;
  // Carrying the ordering key on the reference keeps compositing free of
  // widget-type knowledge.
  owner.entries[*owner.count] = {
      .type = widget_type,
      .index = storage_index,
      .z_index = frame->z_index,
  };
  ++*owner.count;
  return true;
}

}  // namespace simcore::configuration::json
