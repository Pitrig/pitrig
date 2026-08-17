#pragma once

#include <cstdint>
#include <optional>
#include <span>

#include "application_configuration.hpp"
#include "telemetry_types.hpp"

namespace simcore::dashboard::conditions {

// The appearance a widget renders with once its rules have been evaluated.
// Colours are opaque RGB; the widget's own static style is the fallback, so a
// rule that names nothing leaves everything as authored.
struct ResolvedStyle {
  std::uint32_t color{};
  std::uint32_t background_color{};
  std::uint32_t border_color{};
  std::uint16_t blink_ms{};
  bool hidden{};

  [[nodiscard]] bool operator==(const ResolvedStyle&) const = default;
};

// The numeric view of a condition source. Booleans read as 0 or 1, and a source
// that carries its number as text is parsed, so a text-typed field such as
// vehicle.speed can drive a rule. Empty when the value is unavailable or does
// not hold a number.
[[nodiscard]] std::optional<double> condition_value(
    const telemetry::TelemetryRead& value);

// What the rules decided, plus how long the caller should keep that decision
// once the rule stops matching. The hold is what makes a momentary trigger —
// traction control cutting in for a few milliseconds — visible at all.
struct Resolution {
  ResolvedStyle style{};
  std::uint16_t hold_ms{};
  bool matched{};
};

// Where a value sits in its configured window, clamped to 0..1. An empty or
// reversed window reads as empty rather than as an infinity, so a widget with
// an unusable range draws nothing instead of drawing nonsense.
[[nodiscard]] float range_fraction(double value,
                                   const configuration::ValueRange& range);

// Colour interpolated from where the value sits between the ramp's stops. Below
// the first stop and above the last one the ramp holds that stop's colour, so a
// value outside the authored band reads as its nearest edge rather than as
// something the ramp never described. Empty when the value is unavailable or
// the ramp has fewer than two stops, which leaves the authored colour standing.
[[nodiscard]] std::optional<std::uint32_t> ramp_color(
    std::span<const configuration::ColorStop> stops,
    std::optional<double> value);

// Whether one comparison holds. Exposed so a second mechanism that switches on
// the same operators — a container activating in its slot — compares the way the
// styling rules do rather than restating the operator table.
[[nodiscard]] bool condition_holds(configuration::ConditionOperator op,
                                   double value, double threshold);

// The first rule whose comparison holds describes the widget. Without a value
// no rule can match, so an unavailable condition source resolves to the
// fallback rather than latching the last match.
[[nodiscard]] Resolution resolve(
    std::span<const configuration::WidgetCondition> rules,
    std::optional<double> value, const ResolvedStyle& fallback);

}  // namespace simcore::dashboard::conditions
