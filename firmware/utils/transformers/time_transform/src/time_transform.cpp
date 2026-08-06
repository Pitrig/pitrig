#include "time_transform.hpp"

#include <algorithm>
#include <array>
#include <charconv>
#include <string_view>
#include <system_error>

namespace simcore::transformers::time_transform {
namespace {

class Writer final {
 public:
  explicit Writer(const std::span<char> output) : output_(output) {
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
  [[nodiscard]] bool append_integer(const Integer value,
                                    const int minimum_width) {
    std::array<char, 16> digits{};
    const auto result = std::to_chars(
        digits.data(), digits.data() + digits.size(), value);
    if (result.ec != std::errc{}) {
      return false;
    }
    const std::size_t digit_count =
        static_cast<std::size_t>(result.ptr - digits.data());
    for (int padding = minimum_width - static_cast<int>(digit_count);
         padding > 0; --padding) {
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
[[nodiscard]] std::string_view text_view(
    const std::array<char, Size>& text) {
  const auto end = std::find(text.begin(), text.end(), '\0');
  return {text.data(), static_cast<std::size_t>(end - text.begin())};
}

[[nodiscard]] bool write_duration(Writer& writer,
                                  const std::uint32_t milliseconds) {
  const std::uint32_t total_seconds = milliseconds / 1'000;
  return writer.append_integer(total_seconds / 60, 2) &&
         writer.append(":") &&
         writer.append_integer(total_seconds % 60, 2) &&
         writer.append(".") &&
         writer.append_integer(milliseconds % 1'000, 3);
}

[[nodiscard]] bool write_signed_duration(
    Writer& writer, const std::int32_t milliseconds) {
  const std::int64_t wide = milliseconds;
  const std::uint64_t magnitude =
      wide < 0 ? static_cast<std::uint64_t>(-wide)
               : static_cast<std::uint64_t>(wide);
  return writer.append(wide < 0 ? "-" : "+") &&
         writer.append_integer(magnitude / 1'000, 1) &&
         writer.append(".") &&
         writer.append_integer(magnitude % 1'000, 3);
}

template <typename Value, typename Transform>
[[nodiscard]] bool apply_transform(const Config& config, const Value value,
                                   const std::span<char> output,
                                   Transform transform) {
  Writer writer(output);
  return writer.append(text_view(config.prefix)) && transform(writer, value) &&
         writer.append(text_view(config.suffix));
}

}  // namespace

bool duration_ms(const std::uint32_t milliseconds,
                 const std::span<char> output) {
  Writer writer(output);
  return write_duration(writer, milliseconds);
}

bool signed_duration_ms(const std::int32_t milliseconds,
                        const std::span<char> output) {
  Writer writer(output);
  return write_signed_duration(writer, milliseconds);
}

bool apply(const Config& config, const std::uint32_t value,
           const std::span<char> output) {
  return config.format == Format::duration_ms &&
         apply_transform(config, value, output, write_duration);
}

bool apply(const Config& config, const std::int32_t value,
           const std::span<char> output) {
  return config.format == Format::signed_duration_ms &&
         apply_transform(config, value, output, write_signed_duration);
}

}  // namespace simcore::transformers::time_transform
