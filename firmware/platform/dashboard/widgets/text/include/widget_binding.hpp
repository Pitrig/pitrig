#pragma once

#include <array>
#include <cstddef>
#include <span>

#include "telemetry_registry.hpp"
#include "text_widget.hpp"

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::dashboard::text_widget {

struct ModifierReader {
  ValueReadCallback read{};
  void* context{};
};

// A resolved value pipeline for one widget. It deliberately holds no pointer
// into the configuration document: the binder owns everything here, and the
// matching Config is passed alongside as a parallel span, so a configuration
// buffer can be replaced without leaving the binder pointing at stale storage.
struct BoundConfig {
  ValueReadCallback read{};
  void* read_context{};
  bool fast_updates{};
};

class Binder final {
 public:
  [[nodiscard]] bool bind(
      std::span<const Config> configurations,
      const telemetry::ITelemetryRegistry& registry,
      const telemetry::ITelemetryReader& telemetry,
      ModifierReader lap_timer_modifier);

  [[nodiscard]] std::span<const BoundConfig> bindings() const;

 private:
  struct SourceContext {
    const telemetry::ITelemetryReader* telemetry{};
    telemetry::Handle handle{};
  };

  [[nodiscard]] static telemetry::TelemetryRead read_telemetry(void* context);

  std::array<BoundConfig, kMaximumInstances> bindings_{};
  std::array<SourceContext, kMaximumInstances> source_contexts_{};
  std::size_t count_{};
};

}  // namespace simcore::dashboard::text_widget
