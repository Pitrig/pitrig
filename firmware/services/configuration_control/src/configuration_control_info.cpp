#include <cstddef>
#include <cstdio>
#include <string_view>

#include "boot_guard.hpp"
#include "configuration_control.hpp"
#include "esp_app_desc.h"
#include "transport.hpp"

namespace simcore::configuration {

void ConfigurationControl::send_info() {
  const ConfigurationStatus status = service_->status();
  const std::string_view board = board_id_name(service_->hardware_board());
  const boot_guard::Status& health = boot_guard::status();
  const std::string_view reset_reason =
      boot_guard::reset_cause_name(health.cause);
  const std::string_view last_phase = boot_guard::phase_name(health.phase);
  int written = std::snprintf(
      reinterpret_cast<char*>(io_buffer_.data()), io_buffer_.size(),
      "@SC:OK:INFO:board=%.*s,firmware=%s,schema=%u,storage=%u,safe_mode=%u,"
      "boot_failures=%u,reset_reason=%.*s,last_phase=%.*s",
      static_cast<int>(board.size()), board.data(),
      esp_app_get_description()->version,
      static_cast<unsigned>(kConfigurationSchemaVersion),
      status.storage_available ? 1U : 0U, health.safe_mode ? 1U : 0U,
      static_cast<unsigned>(health.consecutive_failures),
      static_cast<int>(reset_reason.size()), reset_reason.data(),
      static_cast<int>(last_phase.size()), last_phase.data());
  for (std::size_t index = 0;
       written > 0 && index < kConfigurationDocumentCount; ++index) {
    const auto document = static_cast<ConfigurationDocument>(index);
    const std::string_view name = configuration_document_name(document);
    const std::string_view outcome =
        document_outcome_name(status.documents[index].outcome);
    const int field = std::snprintf(
        reinterpret_cast<char*>(io_buffer_.data()) + written,
        io_buffer_.size() - static_cast<std::size_t>(written),
        ",%.*s=%.*s:%lu", static_cast<int>(name.size()), name.data(),
        static_cast<int>(outcome.size()), outcome.data(),
        static_cast<unsigned long>(status.documents[index].generation));
    if (field <= 0) {
      written = 0;
      break;
    }
    written += field;
  }
  if (written > 0 &&
      static_cast<std::size_t>(written) + 1U < io_buffer_.size()) {
    io_buffer_[static_cast<std::size_t>(written)] = '\n';
    (void)write_reply(std::span<const std::uint8_t>(
        io_buffer_.data(), static_cast<std::size_t>(written) + 1U));
  }
}

}
