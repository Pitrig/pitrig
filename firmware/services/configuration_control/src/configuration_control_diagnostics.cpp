#include <cstddef>
#include <cstdint>

#include "configuration_control.hpp"
#include "pitrig_features.hpp"

#if PITRIG_DEBUG
#include "debug_diagnostics.hpp"
#endif

namespace pitrig::configuration {

void ConfigurationControl::send_diagnostics() {
#if PITRIG_DEBUG
  const int written = debug::diagnostics::write(
      reinterpret_cast<char*>(io_buffer_.data()), io_buffer_.size());
  if (written > 0 &&
      static_cast<std::size_t>(written) + 1U < io_buffer_.size()) {
    io_buffer_[static_cast<std::size_t>(written)] = '\n';
    (void)write_reply(std::span<const std::uint8_t>(
        io_buffer_.data(), static_cast<std::size_t>(written) + 1U));
  }
#else
  (void)send_text("@PR:ERR:unsupported\n");
#endif
}

}
