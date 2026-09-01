#pragma once

#include <cstdint>
#include <optional>
#include <span>
#include <string_view>

#include "application_configuration.hpp"
#include "led_output.hpp"
#include "rgb_leds.hpp"

namespace simcore::rgb_leds {

struct Panel {
  led::Output* output{};
  const led::Matrix* matrix{};

  void set(int x, int y, led::Color color) const;
};

[[nodiscard]] std::string_view effect_text(const configuration::LedEffect& effect,
                                           const telemetry::TelemetryRead& read,
                                           std::span<char> scratch);

[[nodiscard]] std::optional<Panel> panel_of(led::Output& output,
                                            const led::Matrix& matrix);

void paint_sprite(const Panel& panel,
                  const configuration::LedSpriteConfiguration* sprite,
                  const configuration::LedEffect& effect,
                  std::optional<double> value);

void paint_text(const Panel& panel, const configuration::LedEffect& effect,
                std::string_view text, std::uint64_t elapsed_us);

}
