#include "time_transform.hpp"

#include "text_writer.hpp"

namespace pitrig::transformers::time_transform {
namespace {

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

}

bool apply(const Config& config, const std::uint32_t value, const std::span<char> output) {
  TextWriter writer(output);
  if (config.format == Format::clock_ms) {
    return write_clock(writer, value);
  }
  return config.format == Format::duration_ms && write_duration(writer, value);
}

bool apply(const Config& config, const std::int32_t value, const std::span<char> output) {
  TextWriter writer(output);
  return config.format == Format::signed_duration_ms && write_signed_duration(writer, value);
}

}
