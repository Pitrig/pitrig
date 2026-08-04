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

  // Loads every valid binary font from the memory-mapped asset package.
  // Returns false when at least one binary asset cannot be decoded; usable
  // assets remain registered.
  [[nodiscard]] bool initialize(const font_assets::Service& assets);

  // Resolves an exact font family and pixel size. Returns nullptr when the
  // requested built-in or uploaded font is unavailable.
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
