#pragma once

#include <algorithm>
#include <array>
#include <charconv>
#include <cstddef>
#include <span>
#include <string_view>
#include <system_error>

namespace pitrig::transformers {

class TextWriter final {
 public:
  explicit TextWriter(const std::span<char> output) : output_(output) {
    if (!output_.empty()) {
      output_.front() = '\0';
    }
  }

  [[nodiscard]] bool append(const std::string_view text) {
    if (output_.empty() || text.size() >= output_.size() - length_) {
      return false;
    }
    std::copy(text.begin(), text.end(), output_.begin() + length_);
    length_ += text.size();
    output_[length_] = '\0';
    return true;
  }

  template <typename Integer>
  [[nodiscard]] bool append_integer(const Integer value, const int minimum_width) {
    std::array<char, 24> digits{};
    const auto result = std::to_chars(digits.data(), digits.data() + digits.size(), value);
    if (result.ec != std::errc{}) {
      return false;
    }
    const std::size_t digit_count = static_cast<std::size_t>(result.ptr - digits.data());
    for (int padding = minimum_width - static_cast<int>(digit_count); padding > 0; --padding) {
      if (!append("0")) {
        return false;
      }
    }
    return append({digits.data(), digit_count});
  }

 private:
  std::span<char> output_;
  std::size_t length_{};
};

template <std::size_t Size>
[[nodiscard]] inline std::string_view text_view(const std::array<char, Size>& text) {
  const auto end = std::find(text.begin(), text.end(), '\0');
  return {text.data(), static_cast<std::size_t>(end - text.begin())};
}

}
