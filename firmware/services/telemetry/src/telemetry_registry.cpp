#include "telemetry_registry.hpp"

namespace simcore::telemetry {

Handle TelemetryRegistry::resolve(const std::string_view name) const {
  for (std::size_t index = 0; index < kDescriptors.size(); ++index) {
    if (kDescriptors[index].name == name) {
      return {
          .index = static_cast<std::uint16_t>(index),
          .type = kDescriptors[index].type,
      };
    }
  }
  return {};
}

const FieldDescriptor* TelemetryRegistry::describe(const Handle handle) const {
  if (!handle.valid() || handle.index >= kDescriptors.size()) {
    return nullptr;
  }
  const FieldDescriptor& descriptor = kDescriptors[handle.index];
  return descriptor.type == handle.type ? &descriptor : nullptr;
}

std::size_t TelemetryRegistry::size() const {
  return kDescriptors.size();
}

}  // namespace simcore::telemetry
