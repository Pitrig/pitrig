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

// A resolved value pipeline for one source. It deliberately holds no pointer
// into the configuration document: the binder owns everything here, and the
// matching Config is passed alongside as a parallel span, so a configuration
// buffer can be replaced without leaving the binder pointing at stale storage.
struct BoundConfig {
  ValueReadCallback read{};
  void* read_context{};
  bool fast_updates{};
};

// The resolved sources of one widget, in authored order.
struct WidgetBinding {
  std::array<BoundConfig, kMaximumSources> sources{};
  std::size_t count{};
};

class Binder final {
 public:
  [[nodiscard]] bool bind(
      std::span<const Config> configurations,
      const telemetry::ITelemetryRegistry& registry,
      const telemetry::ITelemetryReader& telemetry,
      ModifierReader lap_timer_modifier);

  [[nodiscard]] std::span<const WidgetBinding> bindings() const;

 private:
  struct SourceContext {
    const telemetry::ITelemetryReader* telemetry{};
    telemetry::Handle handle{};
  };

  [[nodiscard]] bool bind_sources(
      const Config& configuration,
      const telemetry::ITelemetryRegistry& registry,
      const telemetry::ITelemetryReader& telemetry,
      ModifierReader lap_timer_modifier, WidgetBinding& binding);

  [[nodiscard]] static telemetry::TelemetryRead read_telemetry(void* context);

  std::array<WidgetBinding, kMaximumInstances> bindings_{};
  std::array<SourceContext, kMaximumInstances * kMaximumSources>
      source_contexts_{};
  std::size_t count_{};
  std::size_t context_count_{};
};

}  // namespace simcore::dashboard::text_widget
