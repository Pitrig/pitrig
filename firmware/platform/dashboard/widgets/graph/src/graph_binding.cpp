#include "graph_binding.hpp"

namespace pitrig::dashboard::graph_widget {

bool Binder::bind_one(const configuration::ValueSourceConfiguration& source,
                      const telemetry::ITelemetryRegistry& registry,
                      const telemetry::ITelemetryReader& telemetry,
                      const ModifierReaders& modifier_readers,
                      value_smoothing::Service* const smoothing,
                      const std::size_t context_index,
                      frame::BoundSource& bound) {
  if (context_index >= source_contexts_.size()) {
    return false;
  }
  frame::SourceContext& context = source_contexts_[context_index];
  return frame::bind_source(configuration::value_binding_view(source.binding),
                            source.modifier_count, source.modifiers, registry,
                            telemetry, modifier_readers, smoothing, context,
                            bound.read, bound.read_context,
                            bound.fast_updates);
}

bool Binder::bind_sources(const Config& configuration,
                          const std::size_t instance,
                          const telemetry::ITelemetryRegistry& registry,
                          const telemetry::ITelemetryReader& telemetry,
                          const ModifierReaders& modifier_readers,
                          value_smoothing::Service* const smoothing,
                          WidgetBinding& binding) {
  if (configuration.trace_count > configuration.traces.size()) {
    return false;
  }
  const std::size_t base = instance * kContextsPerInstance;
  if (!bind_one(configuration.source, registry, telemetry, modifier_readers,
                smoothing, base, binding.sources[0])) {
    return false;
  }
  binding.count = 1;
  for (std::size_t index = 0; index < configuration.trace_count; ++index) {
    if (!bind_one(configuration.traces[index].source, registry, telemetry,
                  modifier_readers, smoothing, base + binding.count,
                  binding.sources[binding.count])) {
      return false;
    }
    ++binding.count;
  }

  const configuration::WidgetFrame& widget_frame = configuration.frame;
  if (frame::watches_value(widget_frame) &&
      !bind_one(widget_frame.condition_source, registry, telemetry,
                modifier_readers, nullptr, base + kMaximumSources,
                binding.condition)) {
    return false;
  }
  return !frame::binds_caption(widget_frame) ||
         bind_one(widget_frame.title.source, registry, telemetry,
                  modifier_readers, nullptr, base + kMaximumSources + 1,
                  binding.caption);
}

bool Binder::bind(const std::span<const Config> configurations,
                  const telemetry::ITelemetryRegistry& registry,
                  const telemetry::ITelemetryReader& telemetry,
                  const ModifierReaders& modifier_readers,
                  value_smoothing::Service* const smoothing) {
  count_ = 0;
  if (configurations.size() > bindings_.size()) {
    return false;
  }

  for (const Config& configuration : configurations) {
    WidgetBinding& binding = bindings_[count_];
    binding = {};
    if (!bind_sources(configuration, count_, registry, telemetry,
                      modifier_readers, smoothing, binding)) {
      count_ = 0;
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
