#include "widget_binding.hpp"

namespace pitrig::dashboard::text_widget {

bool Binder::bind_one(
    const std::string_view name, const std::uint8_t modifier_count,
    const std::span<const configuration::ValueModifier> modifiers,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReaders& modifier_readers,
    value_smoothing::Service* const smoothing, const std::size_t context_index,
    BoundConfig& bound) {
  if (context_index >= source_contexts_.size()) {
    return false;
  }
  return frame::bind_source(name, modifier_count, modifiers, registry,
                            telemetry, modifier_readers, smoothing,
                            source_contexts_[context_index], bound.read,
                            bound.read_context, bound.fast_updates);
}

bool Binder::bind_sources(
    const Config& configuration, const std::size_t instance,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReaders& modifier_readers,
    value_smoothing::Service* const smoothing, WidgetBinding& binding) {
  if (configuration.source_count == 0 ||
      configuration.source_count > binding.sources.size()) {
    return false;
  }
  const std::size_t base = instance * kContextsPerInstance;
  for (std::size_t index = 0; index < configuration.source_count; ++index) {
    const configuration::TextSourceConfiguration& source =
        configuration.sources[index];
    const bool numeric =
        source.transform.type == configuration::ValueTransformType::number;
    if (!bind_one(configuration::value_binding_view(source.binding),
                  source.modifier_count, source.modifiers, registry, telemetry,
                  modifier_readers, numeric ? smoothing : nullptr,
                  base + index, binding.sources[index])) {
      return false;
    }
  }
  binding.count = configuration.source_count;

  const configuration::WidgetFrame& widget_frame = configuration.frame;
  if (frame::watches_value(widget_frame)) {
    const configuration::ValueSourceConfiguration& watched =
        widget_frame.condition_source;
    if (!bind_one(configuration::value_binding_view(watched.binding),
                  watched.modifier_count, watched.modifiers, registry,
                  telemetry, modifier_readers, nullptr, base + kMaximumSources,
                  binding.condition)) {
      return false;
    }
  }
  if (!frame::binds_caption(widget_frame)) {
    return true;
  }
  const configuration::ValueSourceConfiguration& caption =
      widget_frame.title.source;
  return bind_one(configuration::value_binding_view(caption.binding),
                  caption.modifier_count, caption.modifiers, registry,
                  telemetry, modifier_readers, nullptr,
                  base + kMaximumSources + 1, binding.caption);
}

bool Binder::bind(
    const std::span<const Config> configurations,
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
