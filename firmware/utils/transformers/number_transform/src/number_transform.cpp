#include "number_transform.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdlib>

#include "text_writer.hpp"

namespace pitrig::transformers::number_transform {
namespace {

constexpr std::array<std::int64_t, kMaximumDecimals + 1> kPowersOfTen{
    1, 10, 100, 1'000, 10'000};

constexpr double kMaximumUnits = 9.0e15;

[[nodiscard]] bool write(const Config& config, const double value,
                         const std::span<char> output) {
  if (config.decimals > kMaximumDecimals || !std::isfinite(value) ||
      !std::isfinite(config.scale) || !std::isfinite(config.offset)) {
    return false;
  }
  const double scaled = value * static_cast<double>(config.scale) +
                        static_cast<double>(config.offset);
  const double units =
      scaled * static_cast<double>(kPowersOfTen[config.decimals]);
  if (!std::isfinite(units) || std::abs(units) >= kMaximumUnits) {
    return false;
  }
  const std::int64_t rounded =
      static_cast<std::int64_t>(units < 0.0 ? units - 0.5 : units + 0.5);
  const std::uint64_t magnitude =
      rounded < 0 ? static_cast<std::uint64_t>(-rounded)
                  : static_cast<std::uint64_t>(rounded);
  const auto divisor =
      static_cast<std::uint64_t>(kPowersOfTen[config.decimals]);

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
  return writer.append(".") &&
         writer.append_integer(magnitude % divisor, config.decimals);
}

}

bool apply(const Config& config, const std::uint32_t value,
           const std::span<char> output) {
  return write(config, static_cast<double>(value), output);
}

bool apply(const Config& config, const std::int32_t value,
           const std::span<char> output) {
  return write(config, static_cast<double>(value), output);
}

bool apply(const Config& config, const float value,
           const std::span<char> output) {
  return write(config, static_cast<double>(value), output);
}

bool apply(const Config& config, const std::string_view value,
           const std::span<char> output) {
  float parsed{};
  if (!parse(value, parsed)) {
    return false;
  }
  return write(config, static_cast<double>(parsed), output);
}

bool parse(const std::string_view text, float& value) {
  std::array<char, 32> terminated{};
  const auto starts_a_number = [](const char c) {
    return (c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.';
  };
  if (text.empty() || text.size() >= terminated.size() ||
      !starts_a_number(text.front())) {
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
