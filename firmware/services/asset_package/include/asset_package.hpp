#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "asset_storage.hpp"

namespace pitrig::asset_package {

inline constexpr std::size_t kHeaderSize = 32;

inline constexpr std::size_t kHeaderMagicOffset = 0;
inline constexpr std::size_t kHeaderFormatVersionOffset = 4;
inline constexpr std::size_t kHeaderSizeOffset = 6;
inline constexpr std::size_t kHeaderReservedWordOffset = 8;
inline constexpr std::size_t kHeaderEntryCountOffset = 12;
inline constexpr std::size_t kHeaderReservedOffset = 14;
inline constexpr std::size_t kHeaderPayloadSizeOffset = 16;
inline constexpr std::size_t kHeaderManifestCrcOffset = 20;
inline constexpr std::size_t kHeaderPayloadCrcOffset = 24;
inline constexpr std::size_t kHeaderCrcOffset = 28;

inline constexpr std::size_t kManifestOffset = kHeaderSize;

enum class UpdateError : std::uint8_t {
  none,
  unavailable,
  busy,
  invalid_size,
  invalid_state,
  invalid_package,
  reboot_required,
  storage_failure,
};

[[nodiscard]] const char* update_error_name(UpdateError error);

struct Status {
  bool storage_available{};
  bool package_available{};
  bool reboot_required{};
  std::uint16_t format_version{};
  std::uint16_t entry_count{};
  std::uint32_t package_size{};
};

struct Format {
  std::uint32_t magic{};
  std::uint16_t version{};
  std::uint16_t minimum_version{};
  std::size_t manifest_entry_size{};
  std::size_t maximum_entries{};
  std::size_t data_offset{};
  std::size_t storage_size{};
};

struct Header {
  std::uint16_t entry_count{};
  std::uint16_t format_version{};
  std::uint32_t payload_size{};
  std::uint32_t payload_crc{};
  std::span<const std::uint8_t> manifest{};
};

[[nodiscard]] bool validate_header(const Format& format,
                                   std::span<const std::uint8_t> storage_bytes,
                                   std::span<const std::uint8_t> header_override,
                                   Header& header);

template <typename Asset>
[[nodiscard]] bool entries_overlap(const Asset& lhs, const Asset& rhs) {
  const auto* const lhs_begin = lhs.bytes.data();
  const auto* const rhs_begin = rhs.bytes.data();
  return lhs_begin < rhs_begin + rhs.bytes.size() &&
         rhs_begin < lhs_begin + lhs.bytes.size();
}

}
