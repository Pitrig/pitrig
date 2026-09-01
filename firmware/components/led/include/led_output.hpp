#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "led_driver.hpp"

namespace simcore::led {

inline constexpr std::uint32_t kTransmitTimeoutMs = 100;

struct Color {
  std::uint8_t red{};
  std::uint8_t green{};
  std::uint8_t blue{};

  [[nodiscard]] static constexpr Color from_rgb(const std::uint32_t value) {
    return {static_cast<std::uint8_t>((value >> 16) & 0xFFU),
            static_cast<std::uint8_t>((value >> 8) & 0xFFU),
            static_cast<std::uint8_t>(value & 0xFFU)};
  }

  [[nodiscard]] constexpr Color scaled(const std::uint8_t level) const {
    return {static_cast<std::uint8_t>((red * level + 127U) / 255U),
            static_cast<std::uint8_t>((green * level + 127U) / 255U),
            static_cast<std::uint8_t>((blue * level + 127U) / 255U)};
  }

  [[nodiscard]] constexpr Color faded(const float level) const {
    const float clamped = level < 0.0F ? 0.0F : (level > 1.0F ? 1.0F : level);
    return {static_cast<std::uint8_t>(red * clamped),
            static_cast<std::uint8_t>(green * clamped),
            static_cast<std::uint8_t>(blue * clamped)};
  }

  [[nodiscard]] bool operator==(const Color&) const = default;
};

struct Trim {
  std::uint8_t brightness{255};
  bool gamma{true};
  std::uint16_t current_limit_ma{};
};

class Output final {
 public:
  Output() = default;
  ~Output();
  Output(const Output&) = delete;
  Output& operator=(const Output&) = delete;

  [[nodiscard]] bool open(const driver::Driver& driver,
                          const driver::Configuration& configuration,
                          std::span<std::uint8_t> working,
                          std::span<std::uint8_t> wire,
                          std::span<std::uint8_t> shadow = {});
  void close();

  [[nodiscard]] bool ready() const { return handle_.valid(); }
  [[nodiscard]] std::size_t lamps() const { return lamps_; }

  void clear();
  void set(std::size_t lamp, Color color);
  [[nodiscard]] Color get(std::size_t lamp) const;

  [[nodiscard]] bool changed() const;
  void settle();

  [[nodiscard]] bool flush(const Trim& trim);
  [[nodiscard]] bool finish(std::uint32_t timeout_ms) const;

 private:
  [[nodiscard]] std::uint8_t scale(std::uint8_t channel,
                                   std::uint8_t brightness, bool gamma) const;

  const driver::Driver* driver_{};
  driver::Handle handle_{};
  driver::Chip chip_{driver::Chip::ws2812b};
  std::span<std::uint8_t> working_{};
  std::span<std::uint8_t> shadow_{};
  std::span<std::uint8_t> wire_{};
  std::size_t lamps_{};
};

[[nodiscard]] std::size_t working_bytes(std::size_t lamps);
[[nodiscard]] std::size_t wire_bytes(std::size_t lamps, driver::Chip chip);

}
