#pragma once

#include <array>
#include <cstddef>

#include "dashboard_layout.hpp"
#include "font_asset_service.hpp"
#include "lvgl.h"

namespace simcore::dashboard::fonts {

class Registry final {
 public:
  Registry() = default;
  Registry(const Registry&) = delete;
  Registry& operator=(const Registry&) = delete;

  // Loads every valid binary font from the active memory-mapped asset slot.
  // Returns false when at least one binary asset cannot be decoded; usable
  // assets remain registered and unresolved fonts use Montserrat.
  [[nodiscard]] bool initialize(const font_assets::Service& assets);

  // Resolves a font by its stable family identifier and pixel size. Missing
  // assets and unsupported built-in sizes fall back to the nearest compiled
  // Montserrat size.
  [[nodiscard]] const lv_font_t* resolve(const FontSpec& spec) const;

 private:
  struct Entry {
    FontSpec font{};
    lv_font_t* lv_font{};
  };

  std::array<Entry, font_assets::kMaximumAssets> entries_{};
  std::size_t count_{};
  bool initialized_{};
};

}  // namespace simcore::dashboard::fonts
