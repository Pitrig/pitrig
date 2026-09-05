#include "asset_package.hpp"

#include "binary_codec.hpp"
#include "crc32.hpp"

namespace pitrig::asset_package {

const char* update_error_name(const UpdateError error) {
  switch (error) {
    case UpdateError::none:
      return "none";
    case UpdateError::unavailable:
      return "unavailable";
    case UpdateError::busy:
      return "busy";
    case UpdateError::invalid_size:
      return "invalid_size";
    case UpdateError::invalid_state:
      return "invalid_state";
    case UpdateError::invalid_package:
      return "invalid_package";
    case UpdateError::reboot_required:
      return "reboot_required";
    case UpdateError::storage_failure:
      return "storage_failure";
  }
  return "unknown";
}

bool validate_header(const Format& format,
                     const std::span<const std::uint8_t> storage_bytes,
                     const std::span<const std::uint8_t> header_override,
                     Header& parsed) {
  parsed = {};
  if (storage_bytes.size() != format.storage_size ||
      (!header_override.empty() && header_override.size() != kHeaderSize)) {
    return false;
  }
  const auto header = header_override.empty()
                          ? storage_bytes.first(kHeaderSize)
                          : header_override;
  const std::uint16_t entry_count =
      binary::read_u16_le(header, kHeaderEntryCountOffset);
  const std::uint32_t payload_size =
      binary::read_u32_le(header, kHeaderPayloadSizeOffset);
  const std::size_t manifest_size =
      static_cast<std::size_t>(entry_count) * format.manifest_entry_size;
  const std::uint16_t format_version =
      binary::read_u16_le(header, kHeaderFormatVersionOffset);
  if (binary::read_u32_le(header, kHeaderMagicOffset) != format.magic ||
      format_version < format.minimum_version ||
      format_version > format.version ||
      binary::read_u16_le(header, kHeaderSizeOffset) != kHeaderSize ||
      binary::read_u32_le(header, kHeaderReservedWordOffset) != 0 ||
      entry_count > format.maximum_entries ||
      binary::read_u16_le(header, kHeaderReservedOffset) != 0 ||
      kManifestOffset + manifest_size > format.data_offset ||
      payload_size < format.data_offset ||
      payload_size > storage_bytes.size() ||
      binary::read_u32_le(header, kHeaderCrcOffset) !=
          binary::crc32(header.first(kHeaderCrcOffset))) {
    return false;
  }

  const auto manifest = storage_bytes.subspan(kManifestOffset, manifest_size);
  const std::uint32_t payload_crc =
      binary::read_u32_le(header, kHeaderPayloadCrcOffset);
  if (binary::read_u32_le(header, kHeaderManifestCrcOffset) !=
          binary::crc32(manifest) ||
      payload_crc != binary::crc32(storage_bytes.subspan(
                         format.data_offset, payload_size - format.data_offset))) {
    return false;
  }
  parsed = {.entry_count = entry_count,
            .format_version = format_version,
            .payload_size = payload_size,
            .payload_crc = payload_crc,
            .manifest = manifest};
  return true;
}

}
