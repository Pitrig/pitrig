#include "widget_conditions.hpp"

#include <algorithm>
#include <cmath>
#include <string_view>

#include "number_transform.hpp"

namespace simcore::dashboard::conditions {
namespace {

// Linear interpolation per channel in sRGB. Integer arithmetic on bytes, so a
// ramp costs the same on every render pass whatever the display is.
[[nodiscard]] std::uint32_t blend(const std::uint32_t from,
                                  const std::uint32_t to, const double ratio) {
  std::uint32_t blended{};
  for (int shift = 16; shift >= 0; shift -= 8) {
    const auto start = static_cast<double>((from >> shift) & 0xFFU);
    const auto end = static_cast<double>((to >> shift) & 0xFFU);
    const auto channel = static_cast<std::uint32_t>(start + (end - start) * ratio + 0.5);
    blended |= (channel & 0xFFU) << shift;
  }
  return blended;
}

}  // namespace

bool condition_holds(const configuration::ConditionOperator op,
                     const double value, const double threshold) {
  switch (op) {
    case configuration::ConditionOperator::above:
      return value > threshold;
    case configuration::ConditionOperator::at_or_above:
      return value >= threshold;
    case configuration::ConditionOperator::below:
      return value < threshold;
    case configuration::ConditionOperator::at_or_below:
      return value <= threshold;
    case configuration::ConditionOperator::equal:
      return value == threshold;
    case configuration::ConditionOperator::not_equal:
      return value != threshold;
  }
  return false;
}

float range_fraction(const double value,
                     const configuration::ValueRange& range) {
  const double span =
      static_cast<double>(range.maximum) - static_cast<double>(range.minimum);
  if (!(span > 0.0)) {
    return 0.0F;
  }
  const double fraction = (value - static_cast<double>(range.minimum)) / span;
  return static_cast<float>(std::clamp(fraction, 0.0, 1.0));
}

std::optional<double> condition_value(const telemetry::TelemetryRead& value) {
  if (!value.available) {
    return std::nullopt;
  }
  switch (value.handle.type) {
    case telemetry::ValueType::uint32:
      return static_cast<double>(value.value.typed.uint32_value);
    case telemetry::ValueType::int32:
      return static_cast<double>(value.value.typed.int32_value);
    case telemetry::ValueType::float32:
      return std::isfinite(value.value.typed.float32_value)
                 ? std::optional<double>{value.value.typed.float32_value}
                 : std::nullopt;
    case telemetry::ValueType::boolean:
      return value.value.typed.boolean_value ? 1.0 : 0.0;
    case telemetry::ValueType::text: {
      const auto terminator = std::find(value.value.source_text.begin(),
                                        value.value.source_text.end(), '\0');
      const std::string_view text{
          value.value.source_text.data(),
          static_cast<std::size_t>(
              terminator - value.value.source_text.begin())};
      float parsed{};
      if (!transformers::number_transform::parse(text, parsed)) {
        return std::nullopt;
      }
      return static_cast<double>(parsed);
    }
  }
  return std::nullopt;
}

Resolution resolve(const std::span<const configuration::WidgetCondition> rules,
                   const std::optional<double> value,
                   const ResolvedStyle& fallback) {
  if (!value.has_value()) {
    return {.style = fallback};
  }
  for (const configuration::WidgetCondition& rule : rules) {
    if (!condition_holds(rule.op, *value, static_cast<double>(rule.value))) {
      continue;
    }
    ResolvedStyle style = fallback;
    if (rule.color != configuration::kTransparentColor) {
      style.color = rule.color;
    }
    if (rule.background_color != configuration::kTransparentColor) {
      style.background_color = rule.background_color;
    }
    if (rule.border_color != configuration::kTransparentColor) {
      style.border_color = rule.border_color;
    }
    style.hidden = rule.hidden;
    style.blink_ms = rule.blink_ms;
    return {.style = style, .hold_ms = rule.hold_ms, .matched = true};
  }
  return {.style = fallback};
}

std::optional<std::uint32_t> ramp_color(
    const std::span<const configuration::ColorStop> stops,
    const std::optional<double> value) {
  if (stops.size() < 2 || !value.has_value()) {
    return std::nullopt;
  }
  if (*value <= stops.front().at) {
    return stops.front().color;
  }
  if (*value >= stops.back().at) {
    return stops.back().color;
  }
  for (std::size_t index = 1; index < stops.size(); ++index) {
    const configuration::ColorStop& upper = stops[index];
    if (*value > upper.at) {
      continue;
    }
    const configuration::ColorStop& lower = stops[index - 1];
    const double width = static_cast<double>(upper.at) - lower.at;
    // Stops are validated as increasing, so this only guards a pair the
    // validator could not have seen, such as two stops at the same value.
    if (!(width > 0.0)) {
      return lower.color;
    }
    return blend(lower.color, upper.color, (*value - lower.at) / width);
  }
  return stops.back().color;
}

}  // namespace simcore::dashboard::conditions
