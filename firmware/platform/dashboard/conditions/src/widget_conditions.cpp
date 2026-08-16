#include "widget_conditions.hpp"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <string_view>
#include <system_error>

namespace simcore::dashboard::conditions {
namespace {

[[nodiscard]] bool holds(const configuration::ConditionOperator op,
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

}  // namespace

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
      const char* const end = text.data() + text.size();
      const auto result = std::from_chars(text.data(), end, parsed);
      if (result.ec != std::errc{} || result.ptr != end) {
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
    if (!holds(rule.op, *value, static_cast<double>(rule.value))) {
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

}  // namespace simcore::dashboard::conditions
