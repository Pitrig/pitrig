#include "graph_binding.hpp"

namespace simcore::dashboard::graph_widget {

bool Binder::bind_one(const configuration::ValueSourceConfiguration& source,
                      const telemetry::ITelemetryRegistry& registry,
                      const telemetry::ITelemetryReader& telemetry,
                      const ModifierReaders& modifier_readers,
                      frame::BoundSource& bound) {
  if (context_count_ >= source_contexts_.size()) {
    return false;
  }
  frame::SourceContext& context = source_contexts_[context_count_++];
  return frame::bind_source(configuration::value_binding_view(source.binding),
                            source.modifier_count, source.modifiers, registry,
                            telemetry, modifier_readers, context, bound.read,
                            bound.read_context, bound.fast_updates);
}

bool Binder::bind_sources(const Config& configuration,
                          const telemetry::ITelemetryRegistry& registry,
                          const telemetry::ITelemetryReader& telemetry,
                          const ModifierReaders& modifier_readers,
                          WidgetBinding& binding) {
  if (configuration.trace_count > configuration.traces.size()) {
    return false;
  }
  if (!bind_one(configuration.source, registry, telemetry, modifier_readers,
                binding.sources[0])) {
    return false;
  }
  binding.count = 1;
  for (std::size_t index = 0; index < configuration.trace_count; ++index) {
    if (!bind_one(configuration.traces[index].source, registry, telemetry,
                  modifier_readers, binding.sources[binding.count])) {
      return false;
    }
    ++binding.count;
  }

  if (!frame::watches_value(configuration.frame)) {
    return true;
  }
  return bind_one(configuration.frame.condition_source, registry, telemetry,
                  modifier_readers, binding.condition);
}

bool Binder::bind(const std::span<const Config> configurations,
                  const telemetry::ITelemetryRegistry& registry,
                  const telemetry::ITelemetryReader& telemetry,
                  const ModifierReaders& modifier_readers) {
  count_ = 0;
  context_count_ = 0;
  if (configurations.size() > bindings_.size()) {
    return false;
  }

  for (const Config& configuration : configurations) {
    WidgetBinding& binding = bindings_[count_];
    binding = {};
    if (!bind_sources(configuration, registry, telemetry, modifier_readers,
                      binding)) {
      count_ = 0;
      context_count_ = 0;
      return false;
    }
    ++count_;
  }
  return true;
}

std::span<const WidgetBinding> Binder::bindings() const {
  return {bindings_.data(), count_};
}

}
