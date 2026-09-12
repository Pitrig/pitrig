#include "font_asset_control.hpp"

#include <cstdio>
#include <string_view>

#include "asset_operations.hpp"
#include "pitrig_features.hpp"

namespace pitrig::font_assets {
namespace {

constexpr std::string_view kInfoBodyPrefix =
    "storage=1,package=1,format=3,families=8,size=3145728,crc=4294967295,"
    "reboot_required=0,entries=";
constexpr std::size_t kInfoEntryCapacity = kMaximumFamilyIdLength + 1;
static_assert(kInfoBodyPrefix.size() + kMaximumFamilies * kInfoEntryCapacity <=
              asset_control::kInfoBodyCapacity);

int write_info_body(const Service& service, char* const out, const std::size_t size) {
  const Service::Guard guard{service};
  const Status& status = service.status();
  int written = std::snprintf(
      out, size,
      "storage=%u,package=%u,format=%u,families=%u,size=%lu,crc=%lu,"
      "reboot_required=%u,entries=",
      status.storage_available ? 1U : 0U, status.package_available ? 1U : 0U,
      static_cast<unsigned>(status.format_version), static_cast<unsigned>(status.entry_count),
      static_cast<unsigned long>(status.package_size),
      static_cast<unsigned long>(service.payload_crc()), status.reboot_required ? 1U : 0U);
  if (written <= 0 || static_cast<std::size_t>(written) >= size) {
    return -1;
  }
  auto offset = static_cast<std::size_t>(written);
  const auto families = service.family_catalog();
  for (std::size_t index = 0; index < families.size(); ++index) {
    const auto family = family_id_view(families[index]);
    written = std::snprintf(out + offset, size - offset, "%s%.*s", index == 0 ? "" : ";",
                            static_cast<int>(family.size()), family.data());
    if (written <= 0 || static_cast<std::size_t>(written) >= size - offset) {
      return -1;
    }
    offset += static_cast<std::size_t>(written);
  }
  return static_cast<int>(offset);
}

}

bool FontAssetControl::initialize(Service& service, binary_session::Claim& claim,
                                  const std::span<std::uint8_t> frame) {
  return control_.initialize(
      {
          .tag = "FONT",
          .task_name = "font_asset_control",
#if PITRIG_DEBUG
          .metric = performance::TaskMetric::font_asset_control,
#endif
      },
      asset_control::operations_for<Service, &write_info_body>(service), claim, frame);
}

}
