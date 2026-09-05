#pragma once

#include <cstdint>
#include <optional>
#include <span>

#include "application_configuration.hpp"
#include "telemetry_types.hpp"

namespace pitrig::conditions {

struct ResolvedStyle {
  std::uint32_t color{};
  std::uint32_t background_color{};
  std::uint32_t border_color{};
  std::uint16_t blink_ms{};
  bool hidden{};

  [[nodiscard]] bool operator==(const ResolvedStyle&) const = default;
};

[[nodiscard]] std::optional<double> condition_value(
    const telemetry::TelemetryRead& value);

struct Resolution {
  ResolvedStyle style{};
  std::uint16_t hold_ms{};
  bool matched{};
};

[[nodiscard]] float range_fraction(double value,
                                   const configuration::ValueRange& range);

[[nodiscard]] std::optional<std::uint32_t> ramp_color(
    std::span<const configuration::ColorStop> stops,
    std::optional<double> value);

[[nodiscard]] bool condition_holds(configuration::ConditionOperator op,
                                   double value, double threshold);

[[nodiscard]] Resolution resolve(
    std::span<const configuration::WidgetCondition> rules,
    std::optional<double> value, const ResolvedStyle& fallback);

}
