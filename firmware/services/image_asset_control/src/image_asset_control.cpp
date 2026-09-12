#include "image_asset_control.hpp"

#include <cstdio>
#include <string_view>

#include "asset_operations.hpp"
#include "pitrig_features.hpp"

namespace pitrig::image_assets {
namespace {

constexpr std::string_view kInfoBodyPrefix =
    "storage=1,package=1,format=2,images=32,size=7340032,reboot_required=0,"
    "entries=";
constexpr std::size_t kInfoEntryCapacity =
    kMaximumImageIdLength + std::string_view{":2048x2048:rgb565a8:64;"}.size();
static_assert(kInfoBodyPrefix.size() + kMaximumImages * kInfoEntryCapacity <=
              asset_control::kInfoBodyCapacity);

int write_info_body(const Service& service, char* const out, const std::size_t size) {
  const Service::Guard guard{service};
  const Status& status = service.status();
  int written = std::snprintf(
      out, size,
      "storage=%u,package=%u,format=%u,images=%u,size=%lu,reboot_required=%u,"
      "entries=",
      status.storage_available ? 1U : 0U, status.package_available ? 1U : 0U,
      static_cast<unsigned>(status.format_version), static_cast<unsigned>(status.entry_count),
      static_cast<unsigned long>(status.package_size), status.reboot_required ? 1U : 0U);
  if (written <= 0 || static_cast<std::size_t>(written) >= size) {
    return -1;
  }
  auto offset = static_cast<std::size_t>(written);
  const auto images = service.image_catalog();
  for (std::size_t index = 0; index < images.size(); ++index) {
    const auto id = image_id_view(images[index].id);
    const unsigned frames = images[index].frame_count;
    written = std::snprintf(
        out + offset, size - offset, "%s%.*s:%ux%u:%s", index == 0 ? "" : ";",
        static_cast<int>(id.size()), id.data(), static_cast<unsigned>(images[index].width),
        static_cast<unsigned>(images[index].height), color_format_name(images[index].format));
    if (written > 0 && static_cast<std::size_t>(written) < size - offset && frames > 1) {
      const int extra =
          std::snprintf(out + offset + written, size - offset - written, ":%u", frames);
      written = extra > 0 ? written + extra : extra;
    }
    if (written <= 0 || static_cast<std::size_t>(written) >= size - offset) {
      return -1;
    }
    offset += static_cast<std::size_t>(written);
  }
  return static_cast<int>(offset);
}

}

bool ImageAssetControl::initialize(Service& service, binary_session::Claim& claim,
                                   const std::span<std::uint8_t> frame) {
  return control_.initialize(
      {
          .tag = "IMAGE",
          .task_name = "image_asset_control",
#if PITRIG_DEBUG
          .metric = performance::TaskMetric::image_asset_control,
#endif
      },
      asset_control::operations_for<Service, &write_info_body>(service), claim, frame);
}

}
