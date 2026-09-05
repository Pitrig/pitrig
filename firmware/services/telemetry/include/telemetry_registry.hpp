#pragma once

#include <string_view>

#include "telemetry_types.hpp"

namespace pitrig::telemetry {

struct FieldDescriptor {
  std::string_view name;
  ValueType type;
};

namespace fields {

inline constexpr std::string_view kCurrentLapTime = "session.lap.current_time";

}

}

#include "telemetry_catalog_generated.hpp"

namespace pitrig::telemetry {

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

}
