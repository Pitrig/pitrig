#include "json_widgets.hpp"

#include <array>
#include <cstddef>
#include <string_view>

#include "configuration_schema_generated.hpp"
#include "json_readers.hpp"
#include "json_value_pipeline.hpp"
#include "json_widget_variants.hpp"

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

// A slot page activates on the same comparison a widget restyles on, so this
// reads the same watched source and the same operator; what a match does with it
// is all that differs. How long the page then stays up is the page's own
// duration rather than a per-rule hold, because a page is raised as a whole.
[[nodiscard]] bool parse_slot_page_trigger(const cJSON* const object,
                                           SlotPageConfiguration& config,
                                           ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.slot.pages.conditions";
  if (const cJSON* const source = member(object, "source"); source != nullptr) {
    constexpr std::string_view kSourceName = "widget.slot.pages.source";
    if (!valid_object(source, schema::kValueSourceConfigurationKeys,
                      kSourceName, failure) ||
        !read_text(source, "binding", config.source.binding, kSourceName,
                   failure) ||
        !parse_modifiers(source, config.source, failure)) {
      return false;
    }
  }

  return read_array(
      object, "conditions", config.conditions, config.condition_count, kName,
      ValidationError::invalid_slot_page, failure,
      [&](const cJSON* const rule, SlotCondition& parsed) {
        return valid_object(rule, schema::kSlotConditionKeys, kName, failure) &&
               read_enum(rule, "op", parsed.op, condition_operator_from_name,
                         kName, failure) &&
               read_float(rule, "value", parsed.value, kName, failure);
      });
}

// One page's own properties. Its `widgets` are parsed by parse_widget, which
// owns parenting, exactly as a container shape's are.
[[nodiscard]] bool parse_slot_page(const cJSON* const object,
                                   SlotPageConfiguration& config,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.slot.pages";
  return valid_object(object, schema::kSlotPageConfigurationKeys, kName,
                      failure) &&
         read_boolean(object, "in_loop", config.in_loop, kName, failure) &&
         read_enum(object, "trigger", config.trigger, slot_trigger_from_name,
                   kName, failure) &&
         read_integer(object, "duration_ms", config.duration_ms, kName,
                      failure) &&
         parse_slot_page_trigger(object, config, failure);
}

// The slot's own properties, including the pages themselves — a page is not a
// widget, so nothing else parses one. What the pages *hold* is left to
// parse_widget, which owns parenting.
[[nodiscard]] bool parse_slot_widget(const cJSON* const object,
                                     SlotWidgetConfiguration& config,
                                     ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.slot";
  if (!valid_object(object, schema::kSlotWidgetConfigurationKeys, kName,
                    failure) ||
      !parse_frame(object, config.frame, kName, failure)) {
    return false;
  }
  return read_array(
      object, "pages", config.pages, config.page_count, kName,
      ValidationError::invalid_slot, failure,
      [&](const cJSON* const page, SlotPageConfiguration& parsed) {
        return parse_slot_page(page, parsed, failure);
      },
      "pages");
}

// The shape's own properties only. Its `widgets` are parsed by parse_widget,
// which owns parenting, so a widget type still knows nothing about who holds it.
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

}  // namespace

const std::array<WidgetParser, kWidgetTypeTraits.size()> kWidgetParsers{{
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
    [](const cJSON* const object, DashboardConfiguration& dashboard,
       const std::uint8_t index, ValidationFailure& failure) {
      return parse_slot_widget(object, dashboard.slot_widgets[index], failure);
    },
}};

}  // namespace simcore::configuration::json
