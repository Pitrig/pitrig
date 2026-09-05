#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"
#include "font_asset_service.hpp"
#include "lvgl.h"

namespace pitrig::dashboard::fonts {

[[nodiscard]] constexpr std::size_t maximum_font_requests() {
  std::size_t total = configuration::kMaximumTextWidgets;
  for (const configuration::WidgetTypeTraits& traits :
       configuration::kWidgetTypeTraits) {
    total += traits.capacity;
  }
  return total;
}

inline constexpr std::size_t kMaximumFonts = maximum_font_requests();

class Registry final {
 public:
  Registry() = default;
  ~Registry();
  Registry(const Registry&) = delete;
  Registry& operator=(const Registry&) = delete;

  [[nodiscard]] bool load(std::span<const font_assets::FamilyAsset> families,
                          std::span<std::uint8_t> storage);

  [[nodiscard]] bool has_family(const font_assets::FamilyId& family) const;

  [[nodiscard]] bool acquire(const FontSpec& spec);

  void warm(const FontSpec& spec, std::span<const char> characters);

  [[nodiscard]] const lv_font_t* resolve(const FontSpec& spec) const;

  template <typename Predicate>
  void retain_if(Predicate keep) {
    std::size_t retained{};
    for (std::size_t index = 0; index < font_count_; ++index) {
      const Font font = fonts_[index];
      if (keep(font.spec)) {
        fonts_[retained] = font;
        ++retained;
      } else {
        destroy(font.lv_font);
      }
    }
    for (std::size_t index = retained; index < font_count_; ++index) {
      fonts_[index] = {};
    }
    font_count_ = retained;
  }

 private:
  struct Family {
    font_assets::FamilyId id{};
    std::span<const std::uint8_t> bytes{};
  };

  struct Font {
    FontSpec spec{};
    lv_font_t* lv_font{};
  };

  [[nodiscard]] const Family* find_family(
      const font_assets::FamilyId& family) const;
  static void destroy(lv_font_t* font);

  std::array<Family, font_assets::kMaximumFamilies> families_{};
  std::size_t family_count_{};
  std::array<Font, kMaximumFonts> fonts_{};
  std::size_t font_count_{};
};

}
