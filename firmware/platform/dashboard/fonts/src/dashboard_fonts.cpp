#include "dashboard_fonts.hpp"

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

const lv_font_t* resolve(const FontSpec& spec) {
  if (font_family_id_view(spec.family) == "montserrat") {
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
  return montserrat_fallback(spec.size_px);
}

}  // namespace simcore::dashboard::fonts
