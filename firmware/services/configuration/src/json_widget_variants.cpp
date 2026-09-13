#include "json_widget_variants.hpp"

#include <array>
#include <cstddef>
#include <string_view>

#include "configuration_schema_generated.hpp"
#include "json_readers.hpp"
#include "json_value_pipeline.hpp"
#include "json_widget_variants_internal.hpp"
#include "json_widgets.hpp"

namespace pitrig::configuration::json {
namespace {

[[nodiscard]] bool parse_image_widget(const cJSON* const object, ImageWidgetConfiguration& config,
                                      ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.image";
  if (!valid_object(object, schema::kImageWidgetConfigurationKeys, kName, failure) ||
      !parse_frame(object, config.frame, kName, failure) ||
      !read_text(object, "image", config.image, kName, failure) ||
      !read_integer(object, "sprite_frame", config.sprite_frame, kName, failure)) {
    return false;
  }
  if (!parse_value_source(object, "sprite_frame_source", config.sprite_frame_source,
                          "widget.image.sprite_frame_source", failure)) {
    return false;
  }
  config.sprite_frame_source_present = member(object, "sprite_frame_source") != nullptr;
  return read_color(object, "recolor", config.recolor, kName, failure) &&
         read_integer(object, "recolor_opa", config.recolor_opa, kName, failure);
}

[[nodiscard]] bool parse_slot_page_trigger(const cJSON* const object, SlotPageConfiguration& config,
                                           ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.slot.pages.conditions";
  if (!parse_value_source(object, "source", config.source, "widget.slot.pages.source", failure)) {
    return false;
  }

  return read_array(object, "conditions", config.conditions, config.condition_count, kName,
                    ValidationError::out_of_range, failure,
                    [&](const cJSON* const rule, ValueCondition& parsed) {
                      return read_value_condition(rule, parsed, kName, failure);
                    });
}

[[nodiscard]] bool parse_slot_page(const cJSON* const object, SlotPageConfiguration& config,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.slot.pages";
  return valid_object(object, schema::kSlotPageConfigurationKeys, kName, failure) &&
         read_boolean(object, "in_loop", config.in_loop, kName, failure) &&
         read_enum(object, "trigger", config.trigger, slot_trigger_from_name, kName, failure) &&
         read_integer(object, "duration_ms", config.duration_ms, kName, failure) &&
         parse_slot_page_trigger(object, config, failure);
}

[[nodiscard]] bool parse_slot_widget(const cJSON* const object, SlotWidgetConfiguration& config,
                                     ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.slot";
  if (!valid_object(object, schema::kSlotWidgetConfigurationKeys, kName, failure) ||
      !parse_frame(object, config.frame, kName, failure) ||
      !read_boolean(object, "clip_children", config.clip_children, kName, failure)) {
    return false;
  }
  return read_array(
      object, "pages", config.pages, config.page_count, kName, ValidationError::out_of_range,
      failure,
      [&](const cJSON* const page, SlotPageConfiguration& parsed) {
        return parse_slot_page(page, parsed, failure);
      },
      "pages");
}

[[nodiscard]] bool parse_shape_widget(const cJSON* const object, ShapeWidgetConfiguration& config,
                                      ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.shape";
  return valid_object(object, schema::kShapeWidgetConfigurationKeys, kName, failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         read_enum(object, "kind", config.kind, shape_kind_from_name, kName, failure) &&
         read_boolean(object, "clip_children", config.clip_children, kName, failure);
}

[[nodiscard]] bool parse_text_widget(const cJSON* const object, TextWidgetConfiguration& config,
                                     ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text";
  if (!valid_object(object, schema::kTextWidgetConfigurationKeys, kName, failure) ||
      !parse_frame(object, config.frame, kName, failure) ||
      !parse_sources(object, config, failure)) {
    return false;
  }

  const cJSON* const value = member(object, "value");
  if (value == nullptr) {
    return true;
  }
  constexpr std::string_view kValueName = "widget.text.value";
  return valid_object(value, schema::kWidgetValueStyleKeys, kValueName, failure) &&
         parse_optional_font(value, config.value.font, failure) &&
         read_color(value, "color", config.value.color, kValueName, failure) &&
         read_text(value, "unavailable_text", config.value.unavailable_text, kValueName, failure) &&
         read_enum(value, "alignment", config.value.alignment, text_alignment_from_name, kValueName,
                   failure);
}

}

const std::array<WidgetParser, kWidgetTypeTraits.size()> kWidgetParsers{{
    [](const cJSON* const object, DashboardConfiguration& dashboard, const std::uint8_t index,
       ValidationFailure& failure) {
      return parse_text_widget(object, dashboard.text_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard, const std::uint8_t index,
       ValidationFailure& failure) {
      return parse_shape_widget(object, dashboard.shape_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard, const std::uint8_t index,
       ValidationFailure& failure) {
      return variants::parse_bar_widget(object, dashboard.bar_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard, const std::uint8_t index,
       ValidationFailure& failure) {
      return variants::parse_arc_widget(object, dashboard.arc_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard, const std::uint8_t index,
       ValidationFailure& failure) {
      return variants::parse_indicator_widget(object, dashboard.indicator_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard, const std::uint8_t index,
       ValidationFailure& failure) {
      return variants::parse_graph_widget(object, dashboard.graph_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard, const std::uint8_t index,
       ValidationFailure& failure) {
      return parse_image_widget(object, dashboard.image_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard, const std::uint8_t index,
       ValidationFailure& failure) {
      return parse_slot_widget(object, dashboard.slot_widgets[index], failure);
    },
}};

}
