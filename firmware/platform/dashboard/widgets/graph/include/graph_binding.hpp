#pragma once

#include <array>
#include <cstddef>
#include <span>

#include "application_configuration.hpp"
#include "graph_widget.hpp"
#include "telemetry_registry.hpp"
#include "widget_frame.hpp"

namespace simcore::telemetry {
class ITelemetryReader;
}
namespace simcore::value_smoothing {
class Service;
}

namespace simcore::dashboard::graph_widget {

using ModifierReaders = frame::ModifierReaders;

inline constexpr std::size_t kContextsPerInstance = kMaximumSources + 2;

struct WidgetBinding {
  std::array<frame::BoundSource, kMaximumSources> sources{};
  std::size_t count{};
  frame::BoundSource condition{};
  frame::BoundSource caption{};
};

class Binder final {
 public:
  [[nodiscard]] bool bind(std::span<const Config> configurations,
                          const telemetry::ITelemetryRegistry& registry,
                          const telemetry::ITelemetryReader& telemetry,
                          const ModifierReaders& modifier_readers,
                          value_smoothing::Service* smoothing);

  [[nodiscard]] std::span<const WidgetBinding> bindings() const;

 private:
  [[nodiscard]] bool bind_one(
      const configuration::ValueSourceConfiguration& source,
      const telemetry::ITelemetryRegistry& registry,
      const telemetry::ITelemetryReader& telemetry,
      const ModifierReaders& modifier_readers,
      value_smoothing::Service* smoothing, std::size_t context_index,
      frame::BoundSource& bound);

  [[nodiscard]] bool bind_sources(const Config& configuration,
                                  std::size_t instance,
                                  const telemetry::ITelemetryRegistry& registry,
                                  const telemetry::ITelemetryReader& telemetry,
                                  const ModifierReaders& modifier_readers,
                                  value_smoothing::Service* smoothing,
                                  WidgetBinding& binding);

  std::array<WidgetBinding, kMaximumInstances> bindings_{};
  std::array<frame::SourceContext, kMaximumInstances * kContextsPerInstance>
      source_contexts_{};
  std::size_t count_{};
};

}
