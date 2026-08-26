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

namespace simcore::configuration::validation {

bool reject(ValidationFailure& failure, ValidationError error,
            std::string_view path);

[[nodiscard]] bool valid_color(std::uint32_t color);
[[nodiscard]] bool valid_optional_color(std::uint32_t color);
[[nodiscard]] bool valid_transform(const ValueTransform& transform,
                                   telemetry::ValueType type);
[[nodiscard]] bool valid_font(const font_assets::FontSpec& font);

[[nodiscard]] bool on_display(std::int32_t origin_x, std::int32_t origin_y,
                              const WidgetPlacement& placement,
                              std::int32_t display_width,
                              std::int32_t display_height);

[[nodiscard]] bool valid_action(const WidgetAction& action,
                                const DashboardConfiguration& dashboard);

template <std::size_t Size>
[[nodiscard]] bool terminated(const std::array<char, Size>& value) {
  return std::find(value.begin(), value.end(), '\0') != value.end();
}

}
