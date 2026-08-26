#pragma once

#include <array>
#include <cstddef>
#include <span>
#include <string_view>

#include "simhub_catalog_generated.hpp"
#include "telemetry_protocol.hpp"
#include "telemetry_registry.hpp"

namespace simcore::protocols {

class SimHubProtocol final : public telemetry::IProtocol {
 public:
  explicit SimHubProtocol(const telemetry::ITelemetryRegistry& registry);

  [[nodiscard]] bool initialized() const;

  void consume_line(std::span<const std::uint8_t> line,
                    telemetry::UpdateHandler handler,
                    void* context) override;

 private:
  [[nodiscard]] telemetry::Handle resolve_identifier(
      std::span<const char> identifier) const;

  std::array<telemetry::Handle, simhub_catalog::kBindings.size()> handles_{};
  bool initialized_{};
};

}
