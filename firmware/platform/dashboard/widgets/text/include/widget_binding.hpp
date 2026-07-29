#pragma once

#include <array>
#include <cstddef>
#include <span>

#include "telemetry_registry.hpp"
#include "text_widget.hpp"

namespace simcore::dashboard::text_widget {

struct BoundConfig {
  const Config* configuration{};
  telemetry::Handle handle{};
};

class Binder final {
 public:
  [[nodiscard]] bool bind(
      std::span<const Config> configurations,
      const telemetry::ITelemetryRegistry& registry);

  [[nodiscard]] std::span<const BoundConfig> bindings() const;

 private:
  std::array<BoundConfig, kMaximumInstances> bindings_{};
  std::size_t count_{};
};

}  // namespace simcore::dashboard::text_widget
