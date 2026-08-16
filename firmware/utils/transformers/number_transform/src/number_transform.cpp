#include "number_transform.hpp"

#include <array>
#include <charconv>
#include <cmath>
#include <cstddef>
#include <system_error>

#include "text_writer.hpp"

namespace simcore::transformers::number_transform {
namespace {

constexpr std::array<std::int64_t, kMaximumDecimals + 1> kPowersOfTen{
    1, 10, 100, 1'000, 10'000};

// Beyond this the double no longer holds every integer, so rounding would stop
// being exact and the rendered digits would be fiction.
constexpr double kMaximumUnits = 9.0e15;

// Formats in fixed point instead of through printf: the newlib build shipped
// with ESP-IDF gives no dependable float conversion, and the integer path costs
// nothing on a periodic render.
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
  // Half away from zero: the reading a driver expects from a rounded gauge.
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

}  // namespace

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
  const char* const end = value.data() + value.size();
  const auto result = std::from_chars(value.data(), end, parsed);
  if (result.ec != std::errc{} || result.ptr != end) {
    return false;
  }
  return write(config, static_cast<double>(parsed), output);
}

}  // namespace simcore::transformers::number_transform
