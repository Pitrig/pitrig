#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>

#include "application_configuration.hpp"
#include "led_geometry.hpp"
#include "led_output.hpp"
#include "rgb_leds.hpp"

namespace pitrig::rgb_leds {

struct Area {
  std::uint16_t x{};
  std::uint16_t y{};
  std::uint16_t width{};
  std::uint16_t height{};
  std::string_view mask{};
  std::uint16_t stride{};

  [[nodiscard]] bool holds(std::uint16_t column, std::uint16_t row) const;
};

[[nodiscard]] Area area_of(const led::Matrix& matrix,
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

struct LayerColors {
  led::Color ink{};
  std::optional<led::Color> tint{};
  std::optional<led::Color> background{};
  std::uint16_t blink_ms{};
  std::uint64_t since_us{};
};

struct ColorRuleState {
  std::uint64_t hold_until_us{};
  std::uint64_t started_us{};
  int applied{-1};
};

[[nodiscard]] LayerColors colors_of(const configuration::LedEffect& effect,
                                    std::optional<double> watched,
                                    ColorRuleState& state,
                                    std::uint64_t now_us);

[[nodiscard]] Surface surface_of(led::Output& output, const led::Matrix& matrix,
                                 const Area& area,
                                 const configuration::LedEffect& effect);

void fill_area(led::Output& output, const led::Matrix& matrix, const Area& area,
               led::Color color);

void paint(const Surface& surface, const configuration::LedEffect& effect,
           led::Color color, std::optional<double> value,
           std::uint64_t elapsed_us);

}
