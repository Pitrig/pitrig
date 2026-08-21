#include "json_widgets.hpp"

#include <array>
#include <cstddef>
#include <string_view>

#include "configuration_schema_generated.hpp"
#include "json_readers.hpp"
#include "json_value_pipeline.hpp"
#include "json_widget_variants.hpp"
#include "json_widget_variants_internal.hpp"

namespace simcore::configuration::json {
namespace {

[[nodiscard]] bool parse_image_widget(const cJSON* const object,
                                      ImageWidgetConfiguration& config,
                                      ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.image";
  if (!valid_object(object, schema::kImageWidgetConfigurationKeys, kName,
                    failure) ||
      !parse_frame(object, config.frame, kName, failure) ||
      !read_text(object, "image", config.image, kName, failure) ||
      !read_integer(object, "sprite_frame", config.sprite_frame, kName,
                    failure)) {
    return false;
  }
  // Which frames the sheet actually has is an asset question, so it is settled
  // at composition rather than here; what this owes is that the source parsed
  // and that its presence is recorded, since an absent one leaves the widget on
  // the frame it authored.
  if (const cJSON* const source = member(object, "sprite_frame_source");
      source != nullptr) {
    constexpr std::string_view kSourceName = "widget.image.sprite_frame_source";
    if (!valid_object(source, schema::kValueSourceConfigurationKeys, kSourceName,
                      failure) ||
        !read_text(source, "binding", config.sprite_frame_source.binding,
                   kSourceName, failure) ||
        !parse_modifiers(source, config.sprite_frame_source, failure)) {
      return false;
    }
    config.sprite_frame_source_present = true;
  }
  return read_color(object, "recolor", config.recolor, kName, failure) &&
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
      !parse_frame(object, config.frame, kName, failure) ||
      !read_boolean(object, "clip_children", config.clip_children, kName,
                    failure)) {
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
                   failure) &&
         read_boolean(object, "clip_children", config.clip_children, kName,
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
      return variants::parse_bar_widget(object, dashboard.bar_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard,
       const std::uint8_t index, ValidationFailure& failure) {
      return variants::parse_arc_widget(object, dashboard.arc_widgets[index], failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard,
       const std::uint8_t index, ValidationFailure& failure) {
      return variants::parse_indicator_widget(object, dashboard.indicator_widgets[index],
                                    failure);
    },
    [](const cJSON* const object, DashboardConfiguration& dashboard,
       const std::uint8_t index, ValidationFailure& failure) {
      return variants::parse_graph_widget(object, dashboard.graph_widgets[index], failure);
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
