#pragma once

#include <array>
#include <cstddef>
#include <string_view>

#include "telemetry_types.hpp"

namespace simcore::telemetry {

inline constexpr std::size_t kFieldNameCapacity = 40;
using FieldName = std::array<char, kFieldNameCapacity>;

[[nodiscard]] constexpr FieldName make_field_name(const std::string_view name) {
  FieldName result{};
  if (name.size() >= result.size()) {
    return result;
  }
  for (std::size_t index = 0; index < name.size(); ++index) {
    result[index] = name[index];
  }
  return result;
}

[[nodiscard]] inline std::string_view field_name_view(const FieldName& name) {
  std::size_t length{};
  while (length < name.size() && name[length] != '\0') {
    ++length;
  }
  return {name.data(), length};
}

struct FieldDescriptor {
  std::string_view name;
  ValueType type;
};

namespace fields {

inline constexpr std::string_view kSpeed = "vehicle.speed";
inline constexpr std::string_view kRpm = "engine.rpm";
inline constexpr std::string_view kGear = "transmission.gear";
inline constexpr std::string_view kCurrentLapTime = "session.lap.current_time";
inline constexpr std::string_view kBestLapTime = "session.lap.best_time";
inline constexpr std::string_view kFuelLevel = "vehicle.fuel.level";
inline constexpr std::string_view kLapDelta = "session.lap.delta";
inline constexpr std::string_view kEstimatedLapTime =
    "session.lap.estimated_time";
inline constexpr std::string_view kBrakeBias = "vehicle.brake_bias";
inline constexpr std::string_view kFuelAverageConsumption =
    "vehicle.fuel.average_consumption";
inline constexpr std::string_view kFuelLapsRemaining =
    "vehicle.fuel.laps_remaining";

}  // namespace fields

}  // namespace simcore::telemetry

#include "telemetry_catalog_generated.hpp"

namespace simcore::telemetry {

static_assert(catalog::kMaximumFieldCount == kMaximumFields);

class ITelemetryRegistry {
 public:
  virtual ~ITelemetryRegistry() = default;

  [[nodiscard]] virtual Handle resolve(std::string_view name) const = 0;
  [[nodiscard]] virtual const FieldDescriptor* describe(Handle handle) const = 0;
};

class TelemetryRegistry final : public ITelemetryRegistry {
 public:
  [[nodiscard]] Handle resolve(std::string_view name) const override;
  [[nodiscard]] const FieldDescriptor* describe(Handle handle) const override;
};

}  // namespace simcore::telemetry
