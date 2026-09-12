#include "font_asset_service.hpp"

namespace pitrig::font_assets {

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

std::size_t Service::face_bytes_total() const {
  const Guard guard{*this};
  std::size_t total{};
  for (const FamilyAsset& asset : families()) {
    total += (asset.bytes.size() + kFaceAlignment - 1) & ~(kFaceAlignment - 1);
  }
  return total;
}

bool Service::validate_entry(void* const kind, const std::span<const std::uint8_t> storage_bytes,
                             const std::span<const std::uint8_t> header_override) {
  auto& service = *static_cast<Service*>(kind);
  return service.validate_package(storage_bytes, header_override, service.package_);
}

void Service::publish_entry(void* const kind, Status& status) {
  auto& service = *static_cast<Service*>(kind);
  status.format_version = kFormatVersion;
  status.entry_count = service.package_.family_count;
  status.package_size = service.package_.package_size;
  service.payload_crc_ = service.package_.payload_crc;
  service.family_catalog_ = {};
  for (std::size_t index = 0; index < service.package_.family_count; ++index) {
    service.family_catalog_[index] = service.package_.families[index].family;
  }
}

void Service::discard_entry(void* const kind) { static_cast<Service*>(kind)->package_ = {}; }

void Service::forget_entry(void* const kind) {
  auto& service = *static_cast<Service*>(kind);
  service.payload_crc_ = 0;
  service.family_catalog_ = {};
}

}
