#include "dashboard_fonts.hpp"

#include <cstdint>

#include "esp_lvgl_port.h"

namespace simcore::dashboard::fonts {
namespace {

[[nodiscard]] const lv_font_t* montserrat_fallback(
    const std::uint16_t size_px) {
  if (size_px <= 17) {
    return &lv_font_montserrat_10;
  }
  if (size_px <= 36) {
    return &lv_font_montserrat_24;
  }
  return &lv_font_montserrat_48;
}

}  // namespace

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
  if (font_assets::family_id_view(spec.family) == "montserrat") {
    if (spec.size_px == 10) {
      return &lv_font_montserrat_10;
    }
    if (spec.size_px == 24) {
      return &lv_font_montserrat_24;
    }
    if (spec.size_px == 48) {
      return &lv_font_montserrat_48;
    }
  }
  for (std::size_t index = 0; index < count_; ++index) {
    if (entries_[index].font == spec) {
      return entries_[index].lv_font;
    }
  }
  return montserrat_fallback(spec.size_px);
}

}  // namespace simcore::dashboard::fonts
