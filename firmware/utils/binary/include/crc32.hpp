#pragma once

#include <cstdint>
#include <span>

namespace pitrig::binary {

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

}
