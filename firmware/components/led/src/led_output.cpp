#include "led_output.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>

namespace pitrig::led {
namespace {

constexpr std::size_t kWorkingChannels = 3;
constexpr std::uint32_t kMicroampsPerChannel = 20'000 / 255;

constexpr std::uint32_t kFullLevel = 255U << 8;
constexpr std::uint8_t kResidualCentre = 128;

[[nodiscard]] std::array<std::uint16_t, 256> build_gamma() {
  std::array<std::uint16_t, 256> table{};
  for (std::size_t index = 0; index < table.size(); ++index) {
    const double normalized = static_cast<double>(index) / 255.0;
    table[index] = static_cast<std::uint16_t>(std::lround(std::pow(normalized, 2.2) * kFullLevel));
  }
  return table;
}

const std::array<std::uint16_t, 256>& gamma_table() {
  static const std::array<std::uint16_t, 256> table = build_gamma();
  return table;
}

[[nodiscard]] std::uint16_t corrected_of(const std::uint8_t channel, const bool gamma) {
  return gamma ? gamma_table()[channel] : static_cast<std::uint16_t>(channel << 8);
}

[[nodiscard]] std::uint16_t level_of(const std::uint8_t channel, const std::uint8_t brightness,
                                     const bool gamma) {
  return static_cast<std::uint16_t>(
      (static_cast<std::uint32_t>(corrected_of(channel, gamma)) * brightness + 127) / 255);
}

[[nodiscard]] std::uint8_t rounded(const std::uint16_t level) {
  return static_cast<std::uint8_t>((static_cast<std::uint32_t>(level) + kResidualCentre) >> 8);
}

[[nodiscard]] std::uint8_t white_of(const std::uint8_t red, const std::uint8_t green,
                                    const std::uint8_t blue) {
  return std::min({red, green, blue});
}

}

std::size_t working_bytes(const std::size_t lamps) { return lamps * kWorkingChannels; }

std::size_t wire_bytes(const std::size_t lamps, const driver::Chip chip) {
  return lamps * driver::bytes_per_lamp(chip);
}

Output::~Output() { close(); }

bool Output::open(const driver::Driver& driver, const driver::Configuration& configuration,
                  const std::span<std::uint8_t> working, const std::span<std::uint8_t> wire,
                  const std::span<std::uint8_t> shadow, const std::span<std::uint8_t> residual) {
  close();
  const std::size_t working_size = working_bytes(configuration.lamps);
  if (configuration.lamps == 0 || working.size() < working_size ||
      wire.size() < wire_bytes(configuration.lamps, configuration.chip) ||
      (!shadow.empty() && shadow.size() < working_size) ||
      (!residual.empty() && residual.size() < working_size)) {
    return false;
  }
  const driver::Handle handle = driver.open(configuration);
  if (!handle.valid()) {
    return false;
  }
  driver_ = &driver;
  handle_ = handle;
  chip_ = configuration.chip;
  lamps_ = configuration.lamps;
  working_ = working.first(working_bytes(lamps_));
  shadow_ = shadow.empty() ? std::span<std::uint8_t>{} : shadow.first(working_bytes(lamps_));
  residual_ = residual.empty() ? std::span<std::uint8_t>{} : residual.first(working_bytes(lamps_));
  std::fill(residual_.begin(), residual_.end(), kResidualCentre);
  wire_ = wire.first(wire_bytes(lamps_, chip_));
  clear();
  return true;
}

void Output::close() {
  if (driver_ != nullptr && handle_.valid()) {
    darken();
    driver_->close(handle_);
  }
  driver_ = nullptr;
  handle_ = {};
  working_ = {};
  shadow_ = {};
  residual_ = {};
  wire_ = {};
  lamps_ = 0;
}

void Output::darken() {
  if (wire_.empty()) {
    return;
  }
  std::fill(wire_.begin(), wire_.end(), 0);
  if (driver_->transmit(handle_, wire_)) {
    (void)driver_->wait(handle_, kTransmitTimeoutMs);
  }
}

void Output::clear() { std::fill(working_.begin(), working_.end(), 0); }

void Output::set(const std::size_t lamp, const Color color) {
  if (lamp >= lamps_) {
    return;
  }
  const std::size_t offset = lamp * kWorkingChannels;
  working_[offset] = color.red;
  working_[offset + 1] = color.green;
  working_[offset + 2] = color.blue;
}

Color Output::get(const std::size_t lamp) const {
  if (lamp >= lamps_) {
    return {};
  }
  const std::size_t offset = lamp * kWorkingChannels;
  return {working_[offset], working_[offset + 1], working_[offset + 2]};
}

bool Output::changed() const {
  return shadow_.empty() || std::memcmp(working_.data(), shadow_.data(), working_.size()) != 0;
}

void Output::settle() {
  if (!shadow_.empty()) {
    std::memcpy(shadow_.data(), working_.data(), working_.size());
  }
}

std::uint8_t Output::quantize(const std::size_t channel, const std::uint16_t level,
                              const bool dither) {
  if (residual_.empty()) {
    return rounded(level);
  }
  if (!dither) {
    residual_[channel] = kResidualCentre;
    return rounded(level);
  }
  const std::uint32_t sum = static_cast<std::uint32_t>(level) + residual_[channel];
  residual_[channel] = static_cast<std::uint8_t>(sum & 0xFFU);
  return static_cast<std::uint8_t>(sum >> 8);
}

bool Output::flush(const Trim& trim) {
  if (!ready()) {
    return false;
  }
  std::uint8_t brightness = trim.brightness;
  if (trim.current_limit_ma != 0) {
    std::uint64_t corrected_sum = 0;
    for (const std::uint8_t channel : working_) {
      corrected_sum += corrected_of(channel, trim.gamma);
    }
    const std::uint64_t microamps = (corrected_sum >> 8) * brightness / 255 * kMicroampsPerChannel;
    const std::uint64_t budget = static_cast<std::uint64_t>(trim.current_limit_ma) * 1'000;
    if (microamps > budget && microamps != 0) {
      brightness =
          static_cast<std::uint8_t>(static_cast<std::uint64_t>(brightness) * budget / microamps);
    }
  }

  const std::size_t stride = driver::bytes_per_lamp(chip_);
  for (std::size_t lamp = 0; lamp < lamps_; ++lamp) {
    const std::size_t source = lamp * kWorkingChannels;
    const std::uint8_t red =
        quantize(source, level_of(working_[source], brightness, trim.gamma), trim.dither);
    const std::uint8_t green =
        quantize(source + 1, level_of(working_[source + 1], brightness, trim.gamma), trim.dither);
    const std::uint8_t blue =
        quantize(source + 2, level_of(working_[source + 2], brightness, trim.gamma), trim.dither);
    const std::size_t target = lamp * stride;
    wire_[target] = green;
    wire_[target + 1] = red;
    wire_[target + 2] = blue;
    if (stride == 4) {
      const std::uint8_t white = white_of(red, green, blue);
      wire_[target] = static_cast<std::uint8_t>(green - white);
      wire_[target + 1] = static_cast<std::uint8_t>(red - white);
      wire_[target + 2] = static_cast<std::uint8_t>(blue - white);
      wire_[target + 3] = white;
    }
  }
  return driver_->transmit(handle_, wire_);
}

bool Output::finish(const std::uint32_t timeout_ms) const {
  return ready() && driver_->wait(handle_, timeout_ms);
}

}
