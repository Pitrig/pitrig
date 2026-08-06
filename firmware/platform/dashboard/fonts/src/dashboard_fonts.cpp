#include "dashboard_fonts.hpp"

#include <cstdint>

#include "esp_lvgl_port.h"

namespace simcore::dashboard::fonts {
bool Registry::initialize(const font_assets::Service& assets) {
  if (initialized_ || !lvgl_port_lock(0)) {
    return false;
  }
  bool complete = true;
  for (const font_assets::AssetView& asset : assets.assets()) {
    lv_font_t* const font = lv_binfont_create_from_buffer(
        const_cast<std::uint8_t*>(asset.bytes.data()),
        static_cast<std::uint32_t>(asset.bytes.size()));
    if (font == nullptr) {
      complete = false;
      continue;
    }
    entries_[count_++] = {
        .font = asset.font,
        .lv_font = font,
    };
  }
  initialized_ = true;
  lvgl_port_unlock();
  return complete;
}

const lv_font_t* Registry::resolve(const FontSpec& spec) const {
  for (std::size_t index = 0; index < count_; ++index) {
    if (entries_[index].font == spec) {
      return entries_[index].lv_font;
    }
  }
  return nullptr;
}

}  // namespace simcore::dashboard::fonts
