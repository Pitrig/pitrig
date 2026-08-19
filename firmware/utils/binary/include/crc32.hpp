#pragma once

#include <cstdint>
#include <span>

namespace simcore::binary {

// A running CRC-32 over bytes that arrive in pieces. An uploaded firmware image
// is streamed into flash a chunk at a time and is never held whole, so it
// cannot be hashed by the one-shot call below.
class Crc32 final {
 public:
  void update(std::span<const std::uint8_t> bytes);
  [[nodiscard]] std::uint32_t value() const { return ~state_; }
  void reset() { state_ = kInitialState; }

 private:
  static constexpr std::uint32_t kInitialState = 0xFFFF'FFFFU;

  std::uint32_t state_{kInitialState};
};

[[nodiscard]] std::uint32_t crc32(std::span<const std::uint8_t> bytes);

}  // namespace simcore::binary
