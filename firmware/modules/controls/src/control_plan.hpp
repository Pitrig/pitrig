#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#include "application_configuration.hpp"
#include "telemetry_registry.hpp"

namespace pitrig::controls {

inline constexpr std::uint8_t kNone = 0xFF;
inline constexpr std::size_t kButtonCount = configuration::kMaximumInputButtons;

struct Binding {
  configuration::ControlAction action{};
  std::uint8_t button{};
  std::uint8_t screen{kNone};
  std::uint8_t slot{kNone};
  std::uint8_t page{};
  bool wrap{};
  bool repeat{};
};

struct Rule {
  std::uint8_t screen{kNone};
  telemetry::Handle source{};
  std::uint8_t condition_count{};
  std::array<configuration::ValueCondition, configuration::kMaximumWidgetConditions> conditions{};
};

struct Plan {
  std::array<Binding, configuration::kMaximumControlBindings> bindings{};
  std::uint8_t binding_count{};
  std::array<Rule, configuration::kMaximumControlRules> rules{};
  std::uint8_t rule_count{};
  std::uint8_t switch_slot{kNone};
  std::uint8_t home_screen{};
  std::uint32_t home_after_ms{};
  bool session_dismissals{};
  telemetry::Handle buttons{};
  telemetry::Handle position{};
  telemetry::Handle elapsed{};
};

[[nodiscard]] bool controls_used(const configuration::DashboardConfiguration& dashboard);

void build_plan(const configuration::DashboardConfiguration& dashboard,
                const telemetry::ITelemetryRegistry& registry, Plan& plan);

[[nodiscard]] bool repeats(configuration::ControlAction action);

}
