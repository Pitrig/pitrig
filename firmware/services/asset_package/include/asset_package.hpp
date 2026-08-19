#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "asset_storage.hpp"

namespace simcore::asset_package {

// Every uploaded asset kind writes the same 32-byte header and commits it the
// same way: the payload first, the header last, and a reboot before the new
// package is used. Only the manifest entry differs, because a font face
// describes itself and a bitmap does not. What is shared lives here so the two
// kinds cannot drift apart — which they already had, filling the held-back
// header with 0xFF on one side and zeroes on the other.
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

// What the device reports about the installed package of one kind.
struct Status {
  bool storage_available{};
  bool package_available{};
  bool reboot_required{};
  std::uint16_t format_version{};
  std::uint16_t entry_count{};
  std::uint32_t package_size{};
};

// One kind's package format, as data rather than as a template parameter —
// the same shape asset_control already uses to serve both kinds from one
// upload engine.
struct Format {
  std::uint32_t magic{};
  std::uint16_t version{};
  std::size_t manifest_entry_size{};
  std::size_t maximum_entries{};
  std::size_t data_offset{};
  std::size_t storage_size{};
};

// What a header says once everything kind-neutral about it holds.
struct Header {
  std::uint16_t entry_count{};
  std::uint32_t payload_size{};
  // Already verified against the stored bytes by validate_header. It is carried
  // out so a kind can report it: a host that knows the CRC of the package it
  // would upload can tell that the device already holds exactly those bytes and
  // skip a transfer that costs a reboot.
  std::uint32_t payload_crc{};
  std::span<const std::uint8_t> manifest{};
};

// Checks magic, version, header CRC, bounds, and both payload CRCs — every
// rule that does not depend on what a manifest entry means. `header_override`
// supplies a header still held in RAM during a commit; empty reads it from the
// mapping. The kind decodes the manifest itself from `header.manifest`.
[[nodiscard]] bool validate_header(const Format& format,
                                   std::span<const std::uint8_t> storage_bytes,
                                   std::span<const std::uint8_t> header_override,
                                   Header& header);

}  // namespace simcore::asset_package
