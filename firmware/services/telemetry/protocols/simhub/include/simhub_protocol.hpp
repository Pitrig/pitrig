#pragma once

#include <array>
#include <cstddef>
#include <span>
#include <string_view>

#include "simhub_catalog_generated.hpp"
#include "telemetry_protocol.hpp"
#include "telemetry_registry.hpp"

namespace simcore::protocols {

// Decodes SimHub Custom Serial lines into transport-independent typed updates.
// Protocol identifiers are resolved to canonical handles once at startup.
class SimHubProtocol final : public telemetry::IProtocol {
 public:
  explicit SimHubProtocol(const telemetry::ITelemetryRegistry& registry);

  [[nodiscard]] bool initialized() const;

  void consume(std::span<const std::uint8_t> data,
               telemetry::UpdateHandler handler,
               void* context) override;

 private:
  static constexpr std::size_t kMaximumLineLength = 127;

  void process_line(std::span<const char> line,
                    telemetry::UpdateHandler handler,
                    void* context) const;
  [[nodiscard]] telemetry::Handle resolve_identifier(
      std::span<const char> identifier) const;

  std::array<telemetry::Handle, simhub_catalog::kBindings.size()> handles_{};
  std::array<char, kMaximumLineLength> line_buffer_{};
  std::size_t line_length_{};
  bool initialized_{};
  bool discard_until_newline_{};
};

}  // namespace simcore::protocols
