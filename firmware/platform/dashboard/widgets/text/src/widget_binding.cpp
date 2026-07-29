#include "widget_binding.hpp"

namespace simcore::dashboard::text_widget {

bool Binder::bind(
    const std::span<const Config> configurations,
    const telemetry::ITelemetryRegistry& registry) {
  count_ = 0;
  if (configurations.size() > bindings_.size()) {
    return false;
  }

  for (const Config& configuration : configurations) {
    const telemetry::Handle handle =
        registry.resolve(telemetry::field_name_view(configuration.binding));
    if (!handle.valid()) {
      count_ = 0;
      return false;
    }
    bindings_[count_++] = {
        .configuration = &configuration,
        .handle = handle,
    };
  }
  return true;
}

std::span<const BoundConfig> Binder::bindings() const {
  return {bindings_.data(), count_};
}

}  // namespace simcore::dashboard::text_widget
