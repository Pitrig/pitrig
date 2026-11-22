#pragma once

#include <cstddef>
#include <string_view>

namespace pitrig::track_map::digits {

[[nodiscard]] constexpr int value(const char digit) {
  if (digit >= 'A' && digit <= 'Z') {
    return digit - 'A';
  }
  if (digit >= 'a' && digit <= 'z') {
    return digit - 'a' + 26;
  }
  if (digit >= '0' && digit <= '9') {
    return digit - '0' + 52;
  }
  if (digit == '+') {
    return 62;
  }
  return digit == '/' ? 63 : -1;
}

[[nodiscard]] constexpr int signed_step(const int digit) {
  return digit >= 32 ? digit - 64 : digit;
}

class Reader final {
 public:
  explicit Reader(const std::string_view text) : text_(text) {}

  [[nodiscard]] bool one(int& output) {
    if (position_ >= text_.size()) {
      return false;
    }
    output = value(text_[position_++]);
    return output >= 0;
  }

  [[nodiscard]] bool two(int& output) {
    int high{};
    int low{};
    if (!one(high) || !one(low)) {
      return false;
    }
    output = (high << 6) | low;
    return true;
  }

  [[nodiscard]] bool finished() const { return position_ == text_.size(); }

 private:
  std::string_view text_;
  std::size_t position_{};
};

}
