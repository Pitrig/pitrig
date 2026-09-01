#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>

#include "application_configuration.hpp"
#include "led_output.hpp"
#include "rgb_leds.hpp"

namespace simcore::rgb_leds {

class Surface final {
 public:
  Surface(led::Output& output, std::uint16_t first, std::uint16_t count,
          bool inverted, bool mirrored, std::uint8_t brightness)
      : output_(&output),
        first_(first),
        count_(count),
        inverted_(inverted),
        mirrored_(mirrored),
        brightness_(brightness) {}

  [[nodiscard]] std::size_t size() const {
    return mirrored_ ? (count_ + 1U) / 2U : count_;
  }

  void set(std::size_t index, led::Color color) const;

 private:
  [[nodiscard]] std::size_t physical(std::size_t index) const {
    return first_ + (inverted_ ? count_ - 1 - index : index);
  }

  led::Output* output_;
  std::uint16_t first_;
  std::uint16_t count_;
  bool inverted_;
  bool mirrored_;
  std::uint8_t brightness_;
};

[[nodiscard]] std::optional<Surface> surface_of(
    led::Output& output, std::size_t lamps,
    const configuration::LedEffect& effect);

void paint(const Surface& surface, const configuration::LedEffect& effect,
           std::optional<double> value, std::uint64_t elapsed_us);

}
