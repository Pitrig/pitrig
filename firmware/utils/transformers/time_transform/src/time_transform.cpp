#include "time_transform.hpp"

#include <array>

#include "text_writer.hpp"

namespace pitrig::transformers::time_transform {
namespace {

constexpr std::uint32_t kSplitTenthsBelowMinutes = 10;

[[nodiscard]] bool write_duration(TextWriter& writer, const std::uint32_t milliseconds) {
  const std::uint32_t total_seconds = milliseconds / 1'000;
  return writer.append_integer(total_seconds / 60, 2) && writer.append(":") &&
         writer.append_integer(total_seconds % 60, 2) && writer.append(".") &&
         writer.append_integer(milliseconds % 1'000, 3);
}

[[nodiscard]] bool write_clock(TextWriter& writer, const std::uint32_t milliseconds) {
  const std::uint32_t total_seconds = milliseconds / 1'000;
  return writer.append_integer(total_seconds / 3'600, 2) && writer.append(":") &&
         writer.append_integer((total_seconds / 60) % 60, 2) && writer.append(":") &&
         writer.append_integer(total_seconds % 60, 2);
}

[[nodiscard]] bool write_signed_duration(TextWriter& writer, const std::int32_t milliseconds) {
  const std::int64_t wide = milliseconds;
  const std::uint64_t magnitude =
      wide < 0 ? static_cast<std::uint64_t>(-wide) : static_cast<std::uint64_t>(wide);
  return writer.append(wide < 0 ? "-" : "+") && writer.append_integer(magnitude / 1'000, 1) &&
         writer.append(".") && writer.append_integer(magnitude % 1'000, 3);
}

[[nodiscard]] bool write_compact_duration(TextWriter& writer, const std::uint32_t milliseconds) {
  const std::uint32_t total_seconds = milliseconds / 1'000;
  const std::uint32_t minutes = total_seconds / 60;
  if (minutes == 0) {
    return writer.append_integer(total_seconds, 1) && writer.append(".") &&
           writer.append_integer(milliseconds % 1'000, 3);
  }
  return writer.append_integer(minutes, 1) && writer.append(":") &&
         writer.append_integer(total_seconds % 60, 2) && writer.append(".") &&
         writer.append_integer(milliseconds % 1'000, 3);
}

[[nodiscard]] bool write_compact_clock(TextWriter& writer, const std::uint32_t milliseconds) {
  const std::uint32_t total_seconds = milliseconds / 1'000;
  const std::uint32_t hours = total_seconds / 3'600;
  if (hours == 0) {
    return writer.append_integer(total_seconds / 60, 1) && writer.append(":") &&
           writer.append_integer(total_seconds % 60, 2);
  }
  return writer.append_integer(hours, 1) && writer.append(":") &&
         writer.append_integer((total_seconds / 60) % 60, 2) && writer.append(":") &&
         writer.append_integer(total_seconds % 60, 2);
}

[[nodiscard]] bool write_split(TextWriter& writer, const std::uint32_t milliseconds) {
  const std::uint32_t total_seconds = milliseconds / 1'000;
  const std::uint32_t minutes = total_seconds / 60;
  if (minutes == 0) {
    return writer.append_integer(total_seconds, 1) && writer.append(".") &&
           writer.append_integer(milliseconds % 1'000, 3);
  }
  const bool clock = writer.append_integer(minutes, 1) && writer.append(":") &&
                     writer.append_integer(total_seconds % 60, 2);
  if (minutes >= kSplitTenthsBelowMinutes) {
    return clock;
  }
  return clock && writer.append(".") && writer.append_integer((milliseconds % 1'000) / 100, 1);
}

struct DigitStep {
  std::uint64_t unit_ms;
  int decimals;
};

constexpr std::uint64_t kDigitLimit = 10'000;
constexpr std::array<DigitStep, 4> kDigitSteps{
    {{1, 3}, {10, 2}, {100, 1}, {1'000, 0}}};

[[nodiscard]] bool write_signed_digits(TextWriter& writer, const std::int32_t milliseconds) {
  const std::int64_t wide = milliseconds;
  const std::uint64_t magnitude =
      wide < 0 ? static_cast<std::uint64_t>(-wide) : static_cast<std::uint64_t>(wide);
  if (!writer.append(wide < 0 ? "-" : "+")) {
    return false;
  }
  for (const DigitStep& step : kDigitSteps) {
    const std::uint64_t units = (magnitude + step.unit_ms / 2) / step.unit_ms;
    if (units >= kDigitLimit) {
      continue;
    }
    std::uint64_t divisor = 1;
    for (int place = 0; place < step.decimals; ++place) {
      divisor *= 10;
    }
    if (step.decimals == 0) {
      return writer.append_integer(units, 1);
    }
    return writer.append_integer(units / divisor, 1) && writer.append(".") &&
           writer.append_integer(units % divisor, step.decimals);
  }
  return writer.append_integer(kDigitLimit - 1, 1);
}

}

bool apply(const Config& config, const std::uint32_t value, const std::span<char> output) {
  TextWriter writer(output);
  switch (config.format) {
    case Format::duration_ms:
      return write_duration(writer, value);
    case Format::clock_ms:
      return write_clock(writer, value);
    case Format::compact_duration_ms:
      return write_compact_duration(writer, value);
    case Format::compact_clock_ms:
      return write_compact_clock(writer, value);
    case Format::split_ms:
      return write_split(writer, value);
    case Format::signed_duration_ms:
    case Format::signed_digits_ms:
      return false;
  }
  return false;
}

bool apply(const Config& config, const std::int32_t value, const std::span<char> output) {
  TextWriter writer(output);
  if (config.format == Format::signed_digits_ms) {
    return write_signed_digits(writer, value);
  }
  return config.format == Format::signed_duration_ms && write_signed_duration(writer, value);
}

}
