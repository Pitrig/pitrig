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

// The same modifier table every other widget type binds through. A graph
// resolves up to three sources rather than one, but a modifier replaces a
// reading identically, so the type is shared rather than restated.
using ModifierReaders = frame::ModifierReaders;

// The resolved sources of one graph, in the order it draws them: the widget's
// own source first, then the traces beside it, plus the source its styling
// rules watch. It deliberately holds no pointer into the configuration
// document — the binder owns everything here, and the matching Config is passed
// alongside as a parallel span, so a configuration buffer can be replaced
// without leaving the binder pointing at stale storage.
struct WidgetBinding {
  std::array<frame::BoundSource, kMaximumSources> sources{};
  std::size_t count{};
  frame::BoundSource condition{};
};

// Binds every source of every configured graph. Shaped exactly like
// frame::ValueBinder so the widget operations template drives it without
// knowing that this type binds more than one value.
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
  // One context per source, plus the condition source each widget may add.
  std::array<frame::SourceContext, kMaximumInstances*(kMaximumSources + 1)>
      source_contexts_{};
  std::size_t count_{};
  std::size_t context_count_{};
};

}  // namespace simcore::dashboard::graph_widget
