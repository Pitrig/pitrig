#include "outline_decoder.hpp"

#include <cstddef>
#include <span>

#include "track_map_digits.hpp"

namespace pitrig::track_map {
namespace {

constexpr int kVersion = 1;
constexpr std::size_t kCheckDigits = 2;
constexpr int kCheckModulus = 4096;

struct Header {
  int track_count{};
  int pit_count{};
  int pit_from{};
  int pit_to{};
  int finish{};
  int sector_count{};
};

[[nodiscard]] bool check_digits_match(const std::string_view body) {
  if (body.size() < kCheckDigits) {
    return false;
  }
  int sum = 0;
  for (std::size_t index = 0; index + kCheckDigits < body.size(); ++index) {
    const int digit = digits::value(body[index]);
    if (digit < 0) {
      return false;
    }
    sum = (sum + digit) % kCheckModulus;
  }
  digits::Reader check{body.substr(body.size() - kCheckDigits)};
  int expected{};
  return check.two(expected) && expected == sum;
}

[[nodiscard]] bool read_header(digits::Reader& reader, Header& header) {
  int version{};
  if (!reader.one(version) || version != kVersion || !reader.two(header.track_count) ||
      !reader.two(header.pit_count) || !reader.two(header.pit_from) ||
      !reader.two(header.pit_to) || !reader.two(header.finish) ||
      !reader.one(header.sector_count)) {
    return false;
  }
  const bool track_fits =
      header.track_count == 0 ||
      (header.track_count >= 3 && header.track_count <= static_cast<int>(kMaximumTrackPoints));
  const bool pit_fits =
      header.pit_count == 0 ||
      (header.pit_count >= 2 && header.pit_count <= static_cast<int>(kMaximumPitPoints));
  return track_fits && pit_fits &&
         header.sector_count <= static_cast<int>(kMaximumSectorStarts);
}

[[nodiscard]] bool read_line(digits::Reader& reader, const int count, std::span<Point> points) {
  if (count == 0) {
    return true;
  }
  int x{};
  int y{};
  if (!reader.two(x) || !reader.two(y)) {
    return false;
  }
  points[0] = {static_cast<std::int16_t>(x), static_cast<std::int16_t>(y)};
  for (int index = 1; index < count; ++index) {
    int step_x{};
    int step_y{};
    if (!reader.one(step_x) || !reader.one(step_y)) {
      return false;
    }
    x += digits::signed_step(step_x);
    y += digits::signed_step(step_y);
    if (x < 0 || x >= kGridSize || y < 0 || y >= kGridSize) {
      return false;
    }
    points[static_cast<std::size_t>(index)] = {static_cast<std::int16_t>(x),
                                               static_cast<std::int16_t>(y)};
  }
  return true;
}

}

bool decode_outline(const std::string_view body, Outline& outline) {
  if (!check_digits_match(body)) {
    return false;
  }
  digits::Reader reader{body.substr(0, body.size() - kCheckDigits)};
  Header header{};
  if (!read_header(reader, header)) {
    return false;
  }
  for (int index = 0; index < header.sector_count; ++index) {
    int start{};
    if (!reader.two(start)) {
      return false;
    }
    outline.sector_starts[static_cast<std::size_t>(index)] = static_cast<std::uint16_t>(start);
  }
  if (!read_line(reader, header.track_count, outline.track) ||
      !read_line(reader, header.pit_count, outline.pit) || !reader.finished()) {
    return false;
  }
  const bool has_track = header.track_count > 0;
  outline.track_count = static_cast<std::uint16_t>(header.track_count);
  outline.pit_count = has_track ? static_cast<std::uint16_t>(header.pit_count) : 0;
  outline.pit_from = static_cast<std::uint16_t>(header.pit_from);
  outline.pit_to = static_cast<std::uint16_t>(header.pit_to);
  outline.finish = static_cast<std::uint16_t>(header.finish);
  outline.sector_count = has_track ? static_cast<std::uint8_t>(header.sector_count) : 0;
  return true;
}

}
