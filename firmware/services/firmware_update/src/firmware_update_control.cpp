#include "firmware_update_control.hpp"

#include <cstdio>

#include "asset_operations.hpp"

namespace pitrig::firmware_update {
namespace {

int write_info_body(const Service& service, char* const out, const std::size_t size) {
  const Status& status = service.status();
  const int written = std::snprintf(
      out, size,
      "storage=%u,running=%.*s,target=%.*s,version=%.*s,pending_verify=%u,"
      "reboot_required=%u",
      status.available ? 1U : 0U, static_cast<int>(status.running.size()), status.running.data(),
      static_cast<int>(status.target.size()), status.target.data(),
      static_cast<int>(status.version.size()), status.version.data(),
      status.pending_verify ? 1U : 0U, status.reboot_required ? 1U : 0U);
  if (written <= 0 || static_cast<std::size_t>(written) >= size) {
    return -1;
  }
  return written;
}

}

bool FirmwareUpdateControl::initialize(Service& service, binary_session::Claim& claim,
                                       const std::span<std::uint8_t> frame,
                                       asset_control::Worker& worker) {
  return control_.initialize({.tag = "FW"},
                             asset_control::operations_for<Service, &write_info_body>(service),
                             claim, frame, worker);
}

}
