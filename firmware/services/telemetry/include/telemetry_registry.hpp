#pragma once

#include <string_view>

#include "telemetry_types.hpp"

namespace simcore::telemetry {

struct FieldDescriptor {
  std::string_view name;
  ValueType type;
};

// Module composition binds these two by name. Every other field reaches a
// widget through the binding string in configuration, resolved against the
// generated catalog below, so this is not a catalog of its own.
namespace fields {

inline constexpr std::string_view kCurrentLapTime = "session.lap.current_time";
inline constexpr std::string_view kLapDelta = "session.lap.delta";

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
