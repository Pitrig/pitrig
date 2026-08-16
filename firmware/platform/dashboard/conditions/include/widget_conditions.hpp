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

// The first rule whose comparison holds describes the widget. Without a value
// no rule can match, so an unavailable condition source resolves to the
// fallback rather than latching the last match.
[[nodiscard]] Resolution resolve(
    std::span<const configuration::WidgetCondition> rules,
    std::optional<double> value, const ResolvedStyle& fallback);

}  // namespace simcore::dashboard::conditions
