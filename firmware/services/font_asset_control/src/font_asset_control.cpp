#include "font_asset_control.hpp"

#include <cstdio>

namespace simcore::font_assets {
namespace {

// The engine reports failures as the protocol's word, so each operation turns
// this kind's enumeration into one. Success is a null word.
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

// Everything after `@SC:OK:FONT:INFO:` and before the newline. The catalog is
// the installed families, which is what the configurator compares a dashboard's
// font references against.
int write_info_body(void* const service, char* const out,
                    const std::size_t size) {
  const Status& status = service_of(service).status();
  int written = std::snprintf(
      out, size,
      "storage=%u,package=%u,format=%u,families=%u,size=%lu,reboot_required=%u,entries=",
      status.storage_available ? 1U : 0U, status.package_available ? 1U : 0U,
      static_cast<unsigned>(status.format_version),
      static_cast<unsigned>(status.family_count),
      static_cast<unsigned long>(status.package_size),
      status.reboot_required ? 1U : 0U);
  if (written <= 0 || static_cast<std::size_t>(written) >= size) {
    return -1;
  }
  auto offset = static_cast<std::size_t>(written);
  const auto families = service_of(service).family_catalog();
  for (std::size_t index = 0; index < families.size(); ++index) {
    const auto family = family_id_view(families[index]);
    written = std::snprintf(out + offset, size - offset, "%s%.*s",
                            index == 0 ? "" : ";",
                            static_cast<int>(family.size()), family.data());
    if (written <= 0 || static_cast<std::size_t>(written) >= size - offset) {
      return -1;
    }
    offset += static_cast<std::size_t>(written);
  }
  return static_cast<int>(offset);
}

}  // namespace

bool FontAssetControl::initialize(Service& service,
                                  transport::ITransport& transport,
                                  binary_session::Claim& claim) {
  return control_.initialize(
      {
          .tag = "FONT",
          .task_name = "font_asset_control",
          .metric = performance::TaskMetric::font_asset_control,
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
      transport, claim);
}

}  // namespace simcore::font_assets
