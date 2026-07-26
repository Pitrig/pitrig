#include "dashboard_fonts.hpp"

#include <array>

LV_FONT_DECLARE(simcore_lcd_58);
LV_FONT_DECLARE(simcore_lcd_64);
LV_FONT_DECLARE(simcore_lcd_70);
LV_FONT_DECLARE(simcore_lcd_80);
LV_FONT_DECLARE(simcore_roboto_mono_58);

namespace simcore::dashboard::fonts {
namespace {

struct FontEntry {
  FontFamily family;
  std::uint16_t size_px;
  const lv_font_t* font;
};

constexpr std::array<FontEntry, 5> kFonts{{
    {.family = FontFamily::roboto_mono,
     .size_px = 58,
     .font = &simcore_roboto_mono_58},
    {.family = FontFamily::lcd, .size_px = 58, .font = &simcore_lcd_58},
    {.family = FontFamily::lcd, .size_px = 64, .font = &simcore_lcd_64},
    {.family = FontFamily::lcd, .size_px = 70, .font = &simcore_lcd_70},
    {.family = FontFamily::lcd, .size_px = 80, .font = &simcore_lcd_80},
}};

}  // namespace

const lv_font_t* resolve(const FontSpec spec) {
  for (const FontEntry& entry : kFonts) {
    if (entry.family == spec.family && entry.size_px == spec.size_px) {
      return entry.font;
    }
  }

  return &simcore_lcd_58;
}

}  // namespace simcore::dashboard::fonts
