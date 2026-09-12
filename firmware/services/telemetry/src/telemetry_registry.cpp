#include "telemetry_registry.hpp"

namespace pitrig::telemetry {

Handle TelemetryRegistry::resolve(const std::string_view name) const {
  for (std::size_t index = 0; index < catalog::kFieldDescriptors.size(); ++index) {
    if (catalog::kFieldDescriptors[index].name == name) {
      return {
          .index = static_cast<std::uint16_t>(index),
          .type = catalog::kFieldDescriptors[index].type,
      };
    }
  }
  return {};
}

const FieldDescriptor* TelemetryRegistry::describe(const Handle handle) const {
  if (!handle.valid() || handle.index >= catalog::kFieldDescriptors.size()) {
    return nullptr;
  }
  const FieldDescriptor& descriptor = catalog::kFieldDescriptors[handle.index];
  return descriptor.type == handle.type ? &descriptor : nullptr;
}

}
