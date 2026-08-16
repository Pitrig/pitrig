#include "widget_binding.hpp"

#include "telemetry_state.hpp"

namespace simcore::dashboard::text_widget {

bool Binder::bind_sources(
    const Config& configuration,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReader lap_timer_modifier, WidgetBinding& binding) {
  if (configuration.source_count == 0 ||
      configuration.source_count > binding.sources.size()) {
    return false;
  }
  for (std::size_t index = 0; index < configuration.source_count; ++index) {
    const configuration::TextSourceConfiguration& source =
        configuration.sources[index];
    const std::string_view name =
        configuration::value_binding_view(source.binding);
    const telemetry::Handle handle = registry.resolve(name);
    if (!handle.valid()) {
      return false;
    }
    const bool lap_timer_modified =
        source.modifier_count == 1 &&
        source.modifiers.front().type ==
            configuration::ValueModifierType::lap_timer;
    ValueReadCallback read{};
    void* read_context{};
    if (lap_timer_modified) {
      read = lap_timer_modifier.read;
      read_context = lap_timer_modifier.context;
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
    binding.sources[index] = {
        .read = read,
        .read_context = read_context,
        .fast_updates = lap_timer_modified,
    };
  }
  binding.count = configuration.source_count;
  return true;
}

bool Binder::bind(
    const std::span<const Config> configurations,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReader lap_timer_modifier) {
  count_ = 0;
  context_count_ = 0;
  if (configurations.size() > bindings_.size()) {
    return false;
  }

  for (const Config& configuration : configurations) {
    WidgetBinding& binding = bindings_[count_];
    binding = {};
    if (!bind_sources(configuration, registry, telemetry, lap_timer_modifier,
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

}  // namespace simcore::dashboard::text_widget
