#include "number_transform.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdlib>
#include <string_view>

#include "text_writer.hpp"

namespace pitrig::transformers::number_transform {
namespace {

constexpr std::array<std::int64_t, kMaximumDecimals + 1> kPowersOfTen{1, 10, 100, 1'000, 10'000};

constexpr double kMaximumUnits = 9.0e15;

[[nodiscard]] std::size_t digit_run(const std::string_view text, const std::size_t start) {
  std::size_t count = 0;
  while (start + count < text.size() && text[start + count] >= '0' && text[start + count] <= '9') {
    ++count;
  }
  return count;
}

[[nodiscard]] bool decimal_float(const std::string_view text) {
  std::size_t index = 0;
  if (index < text.size() && (text[index] == '+' || text[index] == '-')) {
    ++index;
  }
  const std::size_t integer_digits = digit_run(text, index);
  index += integer_digits;
  std::size_t fraction_digits = 0;
  if (index < text.size() && text[index] == '.') {
    ++index;
    fraction_digits = digit_run(text, index);
    index += fraction_digits;
  }
  if (integer_digits + fraction_digits == 0) {
    return false;
  }
  if (index < text.size() && (text[index] == 'e' || text[index] == 'E')) {
    ++index;
    if (index < text.size() && (text[index] == '+' || text[index] == '-')) {
      ++index;
    }
    const std::size_t exponent_digits = digit_run(text, index);
    if (exponent_digits == 0) {
      return false;
    }
    index += exponent_digits;
  }
  return index == text.size();
}

[[nodiscard]] bool write(const Config& config, const double value, const std::span<char> output) {
  if (config.decimals > kMaximumDecimals || !std::isfinite(value) || !std::isfinite(config.scale) ||
      !std::isfinite(config.offset)) {
    return false;
  }
  const double scaled =
      value * static_cast<double>(config.scale) + static_cast<double>(config.offset);
  const double units = scaled * static_cast<double>(kPowersOfTen[config.decimals]);
  if (!std::isfinite(units) || std::abs(units) >= kMaximumUnits) {
    return false;
  }
  const std::int64_t rounded = static_cast<std::int64_t>(units < 0.0 ? units - 0.5 : units + 0.5);
  const std::uint64_t magnitude =
      rounded < 0 ? static_cast<std::uint64_t>(-rounded) : static_cast<std::uint64_t>(rounded);
  const auto divisor = static_cast<std::uint64_t>(kPowersOfTen[config.decimals]);

  TextWriter writer(output);
  if (rounded < 0 && !writer.append("-")) {
    return false;
  }
  if (!writer.append_integer(magnitude / divisor, 1)) {
    return false;
  }
  if (config.decimals == 0) {
    return true;
  }
  return writer.append(".") && writer.append_integer(magnitude % divisor, config.decimals);
}

}

bool apply(const Config& config, const std::uint32_t value, const std::span<char> output) {
  return write(config, static_cast<double>(value), output);
}

bool apply(const Config& config, const std::int32_t value, const std::span<char> output) {
  return write(config, static_cast<double>(value), output);
}

bool apply(const Config& config, const float value, const std::span<char> output) {
  return write(config, static_cast<double>(value), output);
}

bool apply(const Config& config, const std::string_view value, const std::span<char> output) {
  float parsed{};
  if (!parse(value, parsed)) {
    return false;
  }
  return write(config, static_cast<double>(parsed), output);
}

bool parse(const std::string_view text, float& value) {
  std::array<char, 32> terminated{};
  if (text.empty() || text.size() >= terminated.size() || !decimal_float(text)) {
    return false;
  }
  std::copy(text.begin(), text.end(), terminated.begin());
  char* end = nullptr;
  const float parsed = std::strtof(terminated.data(), &end);
  if (end != terminated.data() + text.size() || !std::isfinite(parsed)) {
    return false;
  }
  value = parsed;
  return true;
}

}
