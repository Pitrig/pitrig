#include "dashboard_fonts.hpp"

#include <array>

LV_FONT_DECLARE(simcore_lcd_39);
LV_FONT_DECLARE(simcore_lcd_43);
LV_FONT_DECLARE(simcore_lcd_47);
LV_FONT_DECLARE(simcore_lcd_53);
LV_FONT_DECLARE(simcore_roboto_mono_43);

namespace simcore::dashboard::fonts {
namespace {

struct FontEntry {
  FontFamily family;
  std::uint16_t size_px;
  const lv_font_t* font;
};

constexpr std::array<FontEntry, 5> kFonts{{
    {.family = FontFamily::roboto_mono,
     .size_px = 43,
     .font = &simcore_roboto_mono_43},
    {.family = FontFamily::lcd, .size_px = 39, .font = &simcore_lcd_39},
    {.family = FontFamily::lcd, .size_px = 43, .font = &simcore_lcd_43},
    {.family = FontFamily::lcd, .size_px = 47, .font = &simcore_lcd_47},
    {.family = FontFamily::lcd, .size_px = 53, .font = &simcore_lcd_53},
}};

}  // namespace

const lv_font_t* resolve(const FontSpec spec) {
  if (spec.family == FontFamily::montserrat) {
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
  for (const FontEntry& entry : kFonts) {
    if (entry.family == spec.family && entry.size_px == spec.size_px) {
      return entry.font;
    }
  }

  return &simcore_lcd_39;
}

}  // namespace simcore::dashboard::fonts
