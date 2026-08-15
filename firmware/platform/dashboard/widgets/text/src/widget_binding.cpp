#include "widget_binding.hpp"

#include "telemetry_state.hpp"

namespace simcore::dashboard::text_widget {

bool Binder::bind(
    const std::span<const Config> configurations,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReader lap_timer_modifier) {
  count_ = 0;
  if (configurations.size() > bindings_.size()) {
    return false;
  }

  for (const Config& configuration : configurations) {
    const std::string_view name =
        configuration::value_binding_view(configuration.binding);
    const telemetry::Handle handle = registry.resolve(name);
    if (!handle.valid()) {
      count_ = 0;
      return false;
    }
    const bool lap_timer_modified =
        configuration.modifier_count == 1 &&
        configuration.modifiers.front().type ==
            configuration::ValueModifierType::lap_timer;
    ValueReadCallback read{};
    void* read_context{};
    if (lap_timer_modified) {
      read = lap_timer_modifier.read;
      read_context = lap_timer_modifier.context;
    } else {
      SourceContext& source = source_contexts_[count_];
      source = {
          .telemetry = &telemetry,
          .handle = handle,
      };
      read = &read_telemetry;
      read_context = &source;
    }
    if (read == nullptr || read_context == nullptr) {
      count_ = 0;
      return false;
    }
    bindings_[count_++] = {
        .read = read,
        .read_context = read_context,
        .fast_updates = lap_timer_modified,
    };
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

std::span<const BoundConfig> Binder::bindings() const {
  return {bindings_.data(), count_};
}

}  // namespace simcore::dashboard::text_widget
