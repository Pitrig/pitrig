#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"
#include "font_asset_types.hpp"
#include "telemetry_types.hpp"

// The rules that answer a question about one value, with no document and no
// widget type behind them: is this colour representable, does this transform
// suit the type it is placed on, does this box fall on the display at all.
// They were mixed in with the per-widget validator, which is what made that
// file six things at once.
namespace simcore::configuration::validation {

// The blink window and the hold bound moved into
// configuration/configuration_schema.json, which is where every other authored
// bound now states itself: the device, the configurator and the property table
// all read the one value instead of three copies of it.

// Records a rejection with the property that caused it. The first cause wins so
// an inner reason is not replaced by the generic error its caller would return.
bool reject(ValidationFailure& failure, ValidationError error,
            std::string_view path);

[[nodiscard]] bool valid_color(std::uint32_t color);
[[nodiscard]] bool valid_optional_color(std::uint32_t color);
[[nodiscard]] bool valid_transform(const ValueTransform& transform,
                                   telemetry::ValueType type);
[[nodiscard]] bool valid_font(const font_assets::FontSpec& font);

// A box is refused only when it is *entirely* off the display, never for
// leaving its container. A caption already overhangs its widget's border by
// design, and an author may legitimately let a readout hang past the panel it
// belongs to; the display is the one edge that has no pixels beyond it.
// `origin` is where the widget's parent sits, so `placement` stays the relative
// geometry the document authored.
[[nodiscard]] bool on_display(std::int32_t origin_x, std::int32_t origin_y,
                              const WidgetPlacement& placement,
                              std::int32_t display_width,
                              std::int32_t display_height);

// A target that names no screen would send a tap nowhere, and a screen named by
// an action type that navigates relatively is a property that does nothing —
// both are authoring mistakes rather than harmless noise, so both are refused.
[[nodiscard]] bool valid_action(const WidgetAction& action,
                                const DashboardConfiguration& dashboard);

template <std::size_t Size>
[[nodiscard]] bool terminated(const std::array<char, Size>& value) {
  return std::find(value.begin(), value.end(), '\0') != value.end();
}

}  // namespace simcore::configuration::validation
