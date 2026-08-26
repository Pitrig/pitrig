#include "widget_binding.hpp"

#include "telemetry_state.hpp"

namespace simcore::dashboard::text_widget {

bool Binder::bind_one(
    const std::string_view name, const std::uint8_t modifier_count,
    const std::span<const configuration::ValueModifier> modifiers,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReaders& modifier_readers, BoundConfig& bound) {
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
    if (context_count_ >= source_contexts_.size()) {
      return false;
    }
    SourceContext& context = source_contexts_[context_count_++];
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
    const Config& configuration,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReaders& modifier_readers, WidgetBinding& binding) {
  if (configuration.source_count == 0 ||
      configuration.source_count > binding.sources.size()) {
    return false;
  }
  for (std::size_t index = 0; index < configuration.source_count; ++index) {
    const configuration::TextSourceConfiguration& source =
        configuration.sources[index];
    if (!bind_one(configuration::value_binding_view(source.binding),
                  source.modifier_count, source.modifiers, registry, telemetry,
                  modifier_readers, binding.sources[index])) {
      return false;
    }
  }
  binding.count = configuration.source_count;

  if (configuration.frame.condition_count == 0) {
    return true;
  }
  const configuration::ValueSourceConfiguration& source =
      configuration.frame.condition_source;
  return bind_one(configuration::value_binding_view(source.binding),
                  source.modifier_count, source.modifiers, registry, telemetry,
                  modifier_readers, binding.condition);
}

bool Binder::bind(
    const std::span<const Config> configurations,
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
