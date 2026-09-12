#include "image_asset_service.hpp"

namespace pitrig::image_assets {

Service::Service()
    : slot_(
          {
              .kind = this,
              .validate = &Service::validate_entry,
              .publish = &Service::publish_entry,
              .discard = &Service::discard_entry,
              .forget = &Service::forget_entry,
          },
          kAssetDataOffset, kStorageSize) {}

bool Service::validate_entry(void* const kind, const std::span<const std::uint8_t> storage_bytes,
                             const std::span<const std::uint8_t> header_override) {
  auto& service = *static_cast<Service*>(kind);
  return service.validate_package(storage_bytes, header_override, service.package_);
}

void Service::publish_entry(void* const kind, Status& status) {
  auto& service = *static_cast<Service*>(kind);
  status.format_version = service.package_.format_version;
  status.entry_count = service.package_.image_count;
  status.package_size = service.package_.package_size;
  service.image_catalog_ = {};
  for (std::size_t index = 0; index < service.package_.image_count; ++index) {
    const ImageAsset& asset = service.package_.images[index];
    service.image_catalog_[index] = {.id = asset.id,
                                     .format = asset.format,
                                     .width = asset.width,
                                     .height = asset.height,
                                     .frame_count = asset.frame_count};
  }
}

void Service::discard_entry(void* const kind) { static_cast<Service*>(kind)->package_ = {}; }

void Service::forget_entry(void* const kind) { static_cast<Service*>(kind)->image_catalog_ = {}; }

}
