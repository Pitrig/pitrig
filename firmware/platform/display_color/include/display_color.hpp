#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "display_color_profile.hpp"

namespace pitrig::display_color {

class Correction final : public configuration::IDashboardColorMap {
 public:
  explicit Correction(const display::driver::ColorProfile& profile);
  ~Correction() override;

  Correction(const Correction&) = delete;
  Correction& operator=(const Correction&) = delete;

  [[nodiscard]] bool valid() const { return valid_; }

  void apply(configuration::ApplicationConfiguration& configuration) const override;

  [[nodiscard]] std::uint32_t correct(std::uint32_t rgb) const;

  void correct_rgb565(std::span<std::uint8_t> pixels);

 private:
  using Levels = std::array<std::uint8_t, 3>;

  [[nodiscard]] std::uint16_t response(std::size_t channel, std::uint8_t level,
                                       std::uint8_t bits) const;
  [[nodiscard]] float light(std::size_t channel, std::uint8_t level, std::uint8_t bits) const;
  [[nodiscard]] Levels drive_levels(const std::array<float, 3>& linear, const Levels& bits) const;
  [[nodiscard]] std::uint16_t corrected_rgb565(std::uint16_t value) const;

  const display::driver::ColorProfile& profile_;
  std::array<float, 9> srgb_to_panel_{};
  std::array<float, 3> white_{};
  std::uint16_t* rgb565_table_{};
  std::uint8_t* rgb565_known_{};
  bool valid_{};
};

}
