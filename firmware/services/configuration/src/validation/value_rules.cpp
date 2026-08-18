#include "value_rules.hpp"

#include <cmath>
#include <limits>
#include <string_view>

#include "telemetry_registry.hpp"

namespace simcore::configuration::validation {

// Records a rejection with the property that caused it. The first cause wins so
// an inner reason is not replaced by the generic error its caller would return.
bool reject(ValidationFailure& failure, const ValidationError error,
            const std::string_view path) {
  if (!failure.ok()) {
    return false;
  }
  failure.error = error;
  std::size_t length = 0;
  for (const char character : path) {
    if (length + 1 >= failure.path.size()) {
      break;
    }
    failure.path[length++] = character;
  }
  return false;
}

[[nodiscard]] bool valid_color(const std::uint32_t color) {
  return color <= 0x00FF'FFFFU;
}

[[nodiscard]] bool valid_optional_color(const std::uint32_t color) {
  return color == kTransparentColor || valid_color(color);
}

// A transform must be able to read the value it is placed on. Each time format
// accepts exactly one millisecond type. The number transform accepts anything
// numeric, including a source that carries its number as text, and is bounded
// by what the fixed-point conversion can render.
[[nodiscard]] bool valid_transform(const ValueTransform& transform,
                                   const telemetry::ValueType type) {
  using transformers::time_transform::Format;
  switch (transform.type) {
    case ValueTransformType::none:
      return true;
    case ValueTransformType::time:
      return (transform.time.format == Format::duration_ms &&
              type == telemetry::ValueType::uint32) ||
             (transform.time.format == Format::signed_duration_ms &&
              type == telemetry::ValueType::int32);
    case ValueTransformType::number:
      return type != telemetry::ValueType::boolean &&
             transform.number.decimals <=
                 transformers::number_transform::kMaximumDecimals &&
             std::isfinite(transform.number.scale) &&
             std::isfinite(transform.number.offset);
  }
  return false;
}

[[nodiscard]] bool valid_font(const font_assets::FontSpec& font) {
  return font_assets::valid_family_id(font.family) && font.size_px != 0 &&
         font.size_px <= font_assets::kMaximumFontSizePx;
}

// An uploaded package carries one face per family, so a document may not name
// more families than a package can hold. Sizes are free: every one of them is

[[nodiscard]] bool on_display(const std::int32_t origin_x,
                              const std::int32_t origin_y,
                              const WidgetPlacement& placement,
                              const std::int32_t display_width,
                              const std::int32_t display_height) {
  if (placement.width < 0 || placement.height < 0) {
    return false;
  }
  const std::int32_t left = origin_x + placement.x;
  const std::int32_t top = origin_y + placement.y;
  return left + placement.width > 0 && top + placement.height > 0 &&
         left < display_width && top < display_height;
}

// A target that names no screen would send a tap nowhere, and a screen named by
// an action type that navigates relatively is a property that does nothing —
// both are authoring mistakes rather than harmless noise, so both are refused.
// `screens` is the document's screen list, which is what the id must match.
[[nodiscard]] bool valid_action(const WidgetAction& action,
                                const DashboardConfiguration& dashboard) {
  const std::string_view target = text_view(action.screen);
  switch (action.type) {
    case WidgetActionType::none:
      return target.empty();
    case WidgetActionType::next_screen:
    case WidgetActionType::previous_screen:
      return target.empty();
    case WidgetActionType::goto_screen:
      break;
  }
  if (target.empty()) {
    return false;
  }
  for (std::size_t index = 0; index < dashboard.screen_count; ++index) {
    if (text_view(dashboard.screens[index].id) == target) {
      return true;
    }
  }
  return false;
}

}  // namespace simcore::configuration::validation
