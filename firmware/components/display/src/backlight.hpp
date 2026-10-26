#pragma once

#include <cstdint>

namespace pitrig::display {

class Backlight final {
 public:
  [[nodiscard]] bool attach(int pin, std::uint8_t percent);
  [[nodiscard]] bool set(std::uint8_t percent);

 private:
  bool attached_{};
};

}
