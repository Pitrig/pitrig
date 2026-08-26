#include "firmware_update_control.hpp"

#include <cstdio>

namespace simcore::firmware_update {
namespace {

[[nodiscard]] const char* word_for(const UpdateError error) {
  return error == UpdateError::none ? nullptr : update_error_name(error);
}

[[nodiscard]] Service& service_of(void* const service) {
  return *static_cast<Service*>(service);
}

const char* begin_update(void* const service, const std::size_t package_size) {
  return word_for(service_of(service).begin_update(package_size));
}

const char* write_update(void* const service,
                         const std::span<const std::uint8_t> bytes) {
  return word_for(service_of(service).write_update(bytes));
}

const char* commit_update(void* const service) {
  return word_for(service_of(service).commit_update());
}

const char* clear(void* const service) {
  return word_for(service_of(service).clear());
}

void cancel_update(void* const service) { service_of(service).cancel_update(); }

int write_info_body(void* const service, char* const out,
                    const std::size_t size) {
  const Status& status = service_of(service).status();
  const int written = std::snprintf(
      out, size,
      "storage=%u,running=%.*s,target=%.*s,version=%.*s,pending_verify=%u,"
      "reboot_required=%u",
      status.available ? 1U : 0U, static_cast<int>(status.running.size()),
      status.running.data(), static_cast<int>(status.target.size()),
      status.target.data(), static_cast<int>(status.version.size()),
      status.version.data(), status.pending_verify ? 1U : 0U,
      status.reboot_required ? 1U : 0U);
  if (written <= 0 || static_cast<std::size_t>(written) >= size) {
    return -1;
  }
  return written;
}

}

bool FirmwareUpdateControl::initialize(Service& service,
                                       binary_session::Claim& claim,
                                       const std::span<std::uint8_t> frame) {
  return control_.initialize(
      {
          .tag = "FW",
          .task_name = "firmware_update",
          .metric = performance::TaskMetric::firmware_update,
      },
      {
          .service = &service,
          .begin_update = &begin_update,
          .write_update = &write_update,
          .commit_update = &commit_update,
          .clear = &clear,
          .cancel_update = &cancel_update,
          .write_info_body = &write_info_body,
      },
      claim, frame);
}

}
