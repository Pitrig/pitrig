#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>

#include "application_configuration.hpp"
#include "led_geometry.hpp"
#include "led_output.hpp"
#include "rgb_leds.hpp"

namespace simcore::rgb_leds {

struct Area {
  std::uint16_t x{};
  std::uint16_t y{};
  std::uint16_t width{};
  std::uint16_t height{};
  std::string_view mask{};
  std::uint16_t stride{};

  [[nodiscard]] bool holds(std::uint16_t column, std::uint16_t row) const;
};

[[nodiscard]] std::optional<Area> area_of(const led::Matrix& matrix,
                                          const configuration::LedEffect& effect);

class Surface final {
 public:
  Surface(led::Output& output, const led::Matrix& matrix, const Area& area,
          bool inverted, bool mirrored)
      : output_(&output),
        matrix_(&matrix),
        area_(area),
        count_(static_cast<std::uint16_t>(area.width * area.height)),
        inverted_(inverted),
        mirrored_(mirrored) {}

  [[nodiscard]] std::size_t size() const {
    return mirrored_ ? (count_ + 1U) / 2U : count_;
  }

  void set(std::size_t index, led::Color color) const;

 private:
  void put(std::size_t offset, led::Color color) const;

  led::Output* output_;
  const led::Matrix* matrix_;
  Area area_;
  std::uint16_t count_;
  bool inverted_;
  bool mirrored_;
};

[[nodiscard]] std::optional<Surface> surface_of(
    led::Output& output, const led::Matrix& matrix,
    const configuration::LedEffect& effect);

void paint(const Surface& surface, const configuration::LedEffect& effect,
           std::optional<double> value, std::uint64_t elapsed_us);

}
