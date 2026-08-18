#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "asset_control.hpp"
#include "binary_codec.hpp"

// The SCF1 upload frame: what the bytes on the wire mean, with nothing in it
// about who owns the stream or when. Both asset kinds send the same frames,
// which is why the engine above this is shared too.
namespace simcore::asset_control::scf1 {

inline constexpr std::array<std::uint8_t, 4> kMagic{'S', 'C', 'F', '1'};
inline constexpr std::size_t kTypeOffset = 4;
inline constexpr std::size_t kReservedByteOffset = 5;
inline constexpr std::size_t kSequenceOffset = 6;
inline constexpr std::size_t kPayloadLengthOffset = 10;
inline constexpr std::size_t kReservedWordOffset = 12;

enum class FrameType : std::uint8_t {
  data = 1,
  commit = 2,
  cancel = 3,
};

// Everything a header says about itself: magic, both reserved fields, and a
// payload length the type actually allows. The sequence and the CRC are the
// caller's business, because they are about the transfer rather than the frame.
[[nodiscard]] inline bool valid_header(
    const std::span<const std::uint8_t> header) {
  if (header.size() != 14 ||
      !std::equal(kMagic.begin(), kMagic.end(), header.begin()) ||
      header[kReservedByteOffset] != 0 ||
      binary::read_u16_le(header, kReservedWordOffset) != 0) {
    return false;
  }
  const auto type = static_cast<FrameType>(header[kTypeOffset]);
  const std::size_t payload_size =
      binary::read_u16_le(header, kPayloadLengthOffset);
  if (type == FrameType::data) {
    return payload_size > 0 && payload_size <= kUploadMaximumChunkSize;
  }
  return (type == FrameType::commit || type == FrameType::cancel) &&
         payload_size == 0;
}

}  // namespace simcore::asset_control::scf1
