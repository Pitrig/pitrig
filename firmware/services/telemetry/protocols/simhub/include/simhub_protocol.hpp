#pragma once

#include <array>
#include <cstddef>
#include <span>

#include "telemetry_protocol.hpp"

namespace simcore::protocols {

// Decodes SimHub Custom Serial lines into transport-independent telemetry
// updates. The parser keeps only the incomplete line between transport chunks.
class SimHubProtocol final : public telemetry::IProtocol {
 public:
  void consume(std::span<const std::uint8_t> data,
               telemetry::UpdateHandler handler,
               void* context) override;

 private:
  static constexpr std::size_t kMaximumLineLength = 31;

  void process_line(std::span<const char> line,
                    telemetry::UpdateHandler handler,
                    void* context) const;

  std::array<char, kMaximumLineLength> line_buffer_{};
  std::size_t line_length_{};
  bool discard_until_newline_{};
};

}  // namespace simcore::protocols
