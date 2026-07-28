#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "configuration_service.hpp"
#include "transport.hpp"

namespace simcore::configuration {

using RebootHandler = void (*)(void* context);

class ConfigurationControl {
 public:
  void initialize(ConfigurationService& service,
                  transport::ITransport& transport,
                  RebootHandler reboot_handler, void* reboot_context);

  // Handles a line that starts with "@SC:" and has no line terminator.
  void consume(std::span<const std::uint8_t> line);

 private:
  static constexpr std::size_t kMaximumResponseSize =
      16 + (kMaximumPayloadSize * 2);

  void send_text(const char* text);
  void send_error(ValidationError error);
  void send_payload(std::span<const std::uint8_t> payload);

  ConfigurationService* service_{};
  transport::ITransport* transport_{};
  RebootHandler reboot_handler_{};
  void* reboot_context_{};
  std::array<std::uint8_t, kMaximumPayloadSize> payload_{};
  std::array<std::uint8_t, kMaximumResponseSize> response_{};
};

}  // namespace simcore::configuration
