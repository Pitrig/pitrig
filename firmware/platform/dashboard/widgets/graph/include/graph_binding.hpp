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

namespace simcore::dashboard::graph_widget {

using ModifierReaders = frame::ModifierReaders;

struct WidgetBinding {
  std::array<frame::BoundSource, kMaximumSources> sources{};
  std::size_t count{};
  frame::BoundSource condition{};
};

class Binder final {
 public:
  [[nodiscard]] bool bind(std::span<const Config> configurations,
                          const telemetry::ITelemetryRegistry& registry,
                          const telemetry::ITelemetryReader& telemetry,
                          const ModifierReaders& modifier_readers);

  [[nodiscard]] std::span<const WidgetBinding> bindings() const;

 private:
  [[nodiscard]] bool bind_one(
      const configuration::ValueSourceConfiguration& source,
      const telemetry::ITelemetryRegistry& registry,
      const telemetry::ITelemetryReader& telemetry,
      const ModifierReaders& modifier_readers, frame::BoundSource& bound);

  [[nodiscard]] bool bind_sources(const Config& configuration,
                                  const telemetry::ITelemetryRegistry& registry,
                                  const telemetry::ITelemetryReader& telemetry,
                                  const ModifierReaders& modifier_readers,
                                  WidgetBinding& binding);

  std::array<WidgetBinding, kMaximumInstances> bindings_{};
  std::array<frame::SourceContext, kMaximumInstances*(kMaximumSources + 1)>
      source_contexts_{};
  std::size_t count_{};
  std::size_t context_count_{};
};

}
