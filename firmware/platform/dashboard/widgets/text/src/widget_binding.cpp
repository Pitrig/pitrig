#include "widget_binding.hpp"

#include "telemetry_state.hpp"

namespace simcore::dashboard::text_widget {

bool Binder::bind_one(
    const std::string_view name, const std::uint8_t modifier_count,
    const std::span<const configuration::ValueModifier> modifiers,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReaders& modifier_readers, const std::size_t context_index,
    BoundConfig& bound) {
  const telemetry::Handle handle = registry.resolve(name);
  if (!handle.valid()) {
    return false;
  }
  const bool modified = modifier_count == 1;
  ValueReadCallback read{};
  void* read_context{};
  if (modified) {
    const frame::ModifierReader reader =
        frame::modifier_reader(modifier_readers, modifiers.front().type);
    read = reader.read;
    read_context = reader.context;
  } else {
    if (context_index >= source_contexts_.size()) {
      return false;
    }
    SourceContext& context = source_contexts_[context_index];
    context = {
        .telemetry = &telemetry,
        .handle = handle,
    };
    read = &read_telemetry;
    read_context = &context;
  }
  if (read == nullptr || read_context == nullptr) {
    return false;
  }
  bound = {
      .read = read,
      .read_context = read_context,
      .fast_updates = modified,
  };
  return true;
}

bool Binder::bind_sources(
    const Config& configuration, const std::size_t instance,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReaders& modifier_readers, WidgetBinding& binding) {
  if (configuration.source_count == 0 ||
      configuration.source_count > binding.sources.size()) {
    return false;
  }
  const std::size_t base = instance * kContextsPerInstance;
  for (std::size_t index = 0; index < configuration.source_count; ++index) {
    const configuration::TextSourceConfiguration& source =
        configuration.sources[index];
    if (!bind_one(configuration::value_binding_view(source.binding),
                  source.modifier_count, source.modifiers, registry, telemetry,
                  modifier_readers, base + index, binding.sources[index])) {
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
                  telemetry, modifier_readers, base + kMaximumSources,
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
                  telemetry, modifier_readers, base + kMaximumSources + 1,
                  binding.caption);
}

bool Binder::bind(
    const std::span<const Config> configurations,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReaders& modifier_readers) {
  count_ = 0;
  if (configurations.size() > bindings_.size()) {
    return false;
  }

  for (const Config& configuration : configurations) {
    WidgetBinding& binding = bindings_[count_];
    binding = {};
    if (!bind_sources(configuration, count_, registry, telemetry,
                      modifier_readers, binding)) {
      count_ = 0;
      return false;
    }
    ++count_;
  }
  return true;
}

telemetry::TelemetryRead Binder::read_telemetry(void* const context) {
  if (context == nullptr) {
    return {};
  }
  const auto& source = *static_cast<const SourceContext*>(context);
  return source.telemetry != nullptr ? source.telemetry->read(source.handle)
                                     : telemetry::TelemetryRead{};
}

std::span<const WidgetBinding> Binder::bindings() const {
  return {bindings_.data(), count_};
}

}
