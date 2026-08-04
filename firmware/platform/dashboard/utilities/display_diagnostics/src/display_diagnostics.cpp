#include "display_diagnostics.hpp"
#include "simcore_features.hpp"

#if SIMCORE_DISPLAY_DIAGNOSTICS

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdio>

#include "dashboard_fonts.hpp"
#include "esp_heap_caps.h"
#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::dashboard::display_diagnostics {
namespace {

constexpr std::uint8_t kPageCount = 5;
constexpr std::uint32_t kAnimationPeriodMs = 16;
constexpr std::uint32_t kCounterPeriodMs = 100;
constexpr std::size_t kBufferAlignment = 64;
constexpr std::array<const char*, kPageCount> kPageNames = {
    "GEOMETRY", "RGB565", "D15..D0", "PCLK/TEARING", "FONT FRINGING"};

struct State {
  Config config{};
  lv_obj_t* canvas{};
  lv_obj_t* title{};
  lv_obj_t* detail{};
  lv_obj_t* font_large{};
  lv_obj_t* font_small{};
  lv_obj_t* moving_vertical{};
  lv_obj_t* moving_horizontal{};
  std::uint16_t* pixels{};
  std::int32_t width{};
  std::int32_t height{};
  std::uint8_t page{};
  std::uint32_t page_started_ms{};
  std::uint32_t last_counter_ms{};
  std::uint32_t frame_counter{};
};

State state;

[[nodiscard]] std::uint16_t rgb565(const std::uint32_t rgb) {
  return lv_color_to_u16(lv_color_hex(rgb));
}

void set_pixel(const std::int32_t x, const std::int32_t y,
               const std::uint16_t color) {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
    return;
  }
  state.pixels[static_cast<std::size_t>(y) * state.width + x] = color;
}

void fill(const std::uint16_t color) {
  std::fill_n(state.pixels,
              static_cast<std::size_t>(state.width) * state.height, color);
}

void fill_rect(std::int32_t x, std::int32_t y, std::int32_t width,
               std::int32_t height, const std::uint16_t color) {
  const std::int32_t x0 = std::clamp<std::int32_t>(x, 0, state.width);
  const std::int32_t y0 = std::clamp<std::int32_t>(y, 0, state.height);
  const std::int32_t x1 =
      std::clamp<std::int32_t>(x + width, 0, state.width);
  const std::int32_t y1 =
      std::clamp<std::int32_t>(y + height, 0, state.height);
  for (std::int32_t row = y0; row < y1; ++row) {
    std::fill_n(state.pixels + static_cast<std::size_t>(row) * state.width + x0,
                x1 - x0, color);
  }
}

void outline_rect(const std::int32_t x, const std::int32_t y,
                  const std::int32_t width, const std::int32_t height,
                  const std::uint16_t color) {
  fill_rect(x, y, width, 1, color);
  fill_rect(x, y + height - 1, width, 1, color);
  fill_rect(x, y, 1, height, color);
  fill_rect(x + width - 1, y, 1, height, color);
}

void show(lv_obj_t* object, const bool visible) {
  if (visible) {
    lv_obj_remove_flag(object, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(object, LV_OBJ_FLAG_HIDDEN);
  }
}

void hide_page_overlays() {
  show(state.detail, false);
  show(state.font_large, false);
  show(state.font_small, false);
  show(state.moving_vertical, false);
  show(state.moving_horizontal, false);
}

void render_geometry() {
  constexpr std::uint16_t black = 0x0000;
  constexpr std::uint16_t white = 0xFFFF;
  constexpr std::uint16_t red = 0xF800;
  constexpr std::uint16_t green = 0x07E0;
  constexpr std::uint16_t blue = 0x001F;
  constexpr std::uint16_t gray = 0x4208;

  fill(black);
  outline_rect(0, 0, state.width, state.height, white);
  outline_rect(2, 2, state.width - 4, state.height - 4, gray);

  const std::int32_t spacing =
      std::max<std::int32_t>(16, std::min(state.width, state.height) / 8);
  for (std::int32_t x = spacing; x < state.width; x += spacing) {
    fill_rect(x, 0, 1, state.height, gray);
  }
  for (std::int32_t y = spacing; y < state.height; y += spacing) {
    fill_rect(0, y, state.width, 1, gray);
  }

  fill_rect(state.width / 2, 0, 1, state.height, white);
  fill_rect(0, state.height / 2, state.width, 1, white);
  fill_rect(0, 0, 16, 16, red);
  fill_rect(state.width - 16, 0, 16, 16, green);
  fill_rect(0, state.height - 16, 16, 16, blue);
  fill_rect(state.width - 16, state.height - 16, 16, 16, white);

  char text[64];
  std::snprintf(text, sizeof(text), "%ld x %ld | 1px borders/grid",
                static_cast<long>(state.width),
                static_cast<long>(state.height));
  lv_label_set_text(state.detail, text);
  show(state.detail, true);
}

void render_colors() {
  constexpr std::array<std::uint16_t, 8> bars = {
      0x0000, 0xFFFF, 0xF800, 0x07E0, 0x001F, 0xFFE0, 0x07FF, 0xF81F,
  };
  fill(0x0000);

  const std::int32_t bar_height =
      std::max<std::int32_t>(24, state.height / 6);
  for (std::size_t index = 0; index < bars.size(); ++index) {
    const std::int32_t x0 =
        static_cast<std::int32_t>(index) * state.width / bars.size();
    const std::int32_t x1 =
        static_cast<std::int32_t>(index + 1) * state.width / bars.size();
    fill_rect(x0, 0, x1 - x0, bar_height, bars[index]);
  }

  const std::int32_t gradient_y = bar_height;
  const std::int32_t gradient_height =
      std::max<std::int32_t>(24, state.height / 6);
  for (std::int32_t x = 0; x < state.width; ++x) {
    const std::uint32_t level =
        static_cast<std::uint32_t>(x) * 255 /
        std::max<std::int32_t>(1, state.width - 1);
    fill_rect(x, gradient_y, 1, gradient_height,
              rgb565((level << 16) | (level << 8) | level));
  }

  const std::int32_t channel_height =
      std::max<std::int32_t>(
          1, (state.height - gradient_y - gradient_height) / 3);
  for (std::size_t channel = 0; channel < 3; ++channel) {
    const std::int32_t y =
        gradient_y + gradient_height + channel * channel_height;
    for (std::int32_t x = 0; x < state.width; ++x) {
      const std::uint32_t level =
          static_cast<std::uint32_t>(x) * 255 /
          std::max<std::int32_t>(1, state.width - 1);
      const std::uint32_t color =
          channel == 0 ? level << 16 : channel == 1 ? level << 8 : level;
      fill_rect(x, y, 1, channel_height, rgb565(color));
    }
  }
}

void render_patterns() {
  constexpr std::uint16_t black = 0x0000;
  constexpr std::uint16_t white = 0xFFFF;
  const std::int32_t half_width = state.width / 2;
  const std::int32_t half_height = state.height / 2;

  for (std::int32_t y = 0; y < state.height; ++y) {
    for (std::int32_t x = 0; x < state.width; ++x) {
      bool on{};
      if (x < half_width && y < half_height) {
        on = ((x + y) & 1) == 0;
      } else if (x >= half_width && y < half_height) {
        on = (x & 1) == 0;
      } else if (x < half_width) {
        on = (y & 1) == 0;
      } else {
        on = (((x / 2) + (y / 2)) & 1) == 0;
      }
      set_pixel(x, y, on ? white : black);
    }
  }
  outline_rect(0, 0, state.width, state.height, 0xF800);
  fill_rect(half_width, 0, 1, state.height, 0x07E0);
  fill_rect(0, half_height, state.width, 1, 0x001F);
  show(state.moving_vertical, true);
  show(state.moving_horizontal, true);
}

void render_data_bits() {
  fill(0x0000);
  constexpr std::int32_t bit_count = 16;
  const std::int32_t half_height = state.height / 2;
  for (std::int32_t column = 0; column < bit_count; ++column) {
    const std::int32_t x0 = column * state.width / bit_count;
    const std::int32_t x1 = (column + 1) * state.width / bit_count;
    const std::uint16_t bit =
        static_cast<std::uint16_t>(1U << (bit_count - 1 - column));
    fill_rect(x0, 0, x1 - x0, half_height, bit);
    fill_rect(x0, half_height, x1 - x0, state.height - half_height,
              static_cast<std::uint16_t>(0xFFFFU ^ bit));
    fill_rect(x0, 0, 1, state.height, 0x0000);
  }
  fill_rect(0, half_height, state.width, 1, 0x0000);
  outline_rect(0, 0, state.width, state.height, 0xFFFF);
}

void render_fonts() {
  constexpr std::array<std::uint16_t, 4> backgrounds = {
      0x0000, 0x2104, 0x0010, 0x780F};
  const std::int32_t block_height =
      std::max<std::int32_t>(1, state.height / 4);
  for (std::size_t index = 0; index < backgrounds.size(); ++index) {
    const auto y = static_cast<std::int32_t>(index) * block_height;
    fill_rect(0, y, state.width,
              index + 1 == backgrounds.size() ? state.height - y
                                              : block_height,
              backgrounds[index]);
  }
  show(state.font_large, true);
  show(state.font_small, true);
}

void render_page(const std::uint8_t page) {
  state.page = page % kPageCount;
  state.page_started_ms = lv_tick_get();
  hide_page_overlays();

  switch (state.page) {
    case 0:
      render_geometry();
      break;
    case 1:
      render_colors();
      break;
    case 2:
      render_data_bits();
      break;
    case 3:
      render_patterns();
      break;
    case 4:
      render_fonts();
      break;
    default:
      break;
  }
  lv_obj_invalidate(state.canvas);
}

void update(lv_timer_t*) {
  const std::uint32_t now = lv_tick_get();
  ++state.frame_counter;

  if (state.config.auto_cycle && state.config.page_duration_ms > 0 &&
      lv_tick_elaps(state.page_started_ms) >= state.config.page_duration_ms) {
    render_page((state.page + 1) % kPageCount);
  }

  if (state.page == 3) {
    lv_obj_set_x(
        state.moving_vertical,
        static_cast<std::int32_t>(
            (now / 5) % std::max<std::int32_t>(1, state.width)));
    lv_obj_set_y(
        state.moving_horizontal,
        static_cast<std::int32_t>(
            (now / 7) % std::max<std::int32_t>(1, state.height)));
  }

  if (lv_tick_elaps(state.last_counter_ms) >= kCounterPeriodMs) {
    state.last_counter_ms = now;
    char title[64];
    std::snprintf(title, sizeof(title), "%u/%u %s frame=%lu",
                  static_cast<unsigned>(state.page + 1),
                  static_cast<unsigned>(kPageCount), kPageNames[state.page],
                  static_cast<unsigned long>(state.frame_counter));
    lv_label_set_text(state.title, title);
  }
}

lv_obj_t* create_label(lv_obj_t* parent, const std::int32_t y,
                       const std::uint32_t color) {
  lv_obj_t* const label = lv_label_create(parent);
  lv_obj_remove_style_all(label);
  lv_obj_set_pos(label, 4, y);
  lv_obj_set_width(label, state.width - 8);
  lv_obj_set_style_text_color(label, lv_color_hex(color), LV_PART_MAIN);
  lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  return label;
}

}  // namespace

bool create(lv_display_t* const display, const Config& config,
            const fonts::Registry& fonts) {
  if (display == nullptr || !lvgl_port_lock(0)) {
    return false;
  }

  state = {};
  state.config = config;
  state.width = lv_display_get_horizontal_resolution(display);
  state.height = lv_display_get_vertical_resolution(display);
  const std::size_t pixel_count =
      static_cast<std::size_t>(state.width) * state.height;
  const std::size_t buffer_bytes = pixel_count * sizeof(std::uint16_t);
  state.pixels = static_cast<std::uint16_t*>(heap_caps_aligned_alloc(
      kBufferAlignment, buffer_bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (state.pixels == nullptr) {
    state.pixels = static_cast<std::uint16_t*>(heap_caps_aligned_alloc(
        kBufferAlignment, buffer_bytes, MALLOC_CAP_8BIT));
  }
  if (state.pixels == nullptr) {
    lvgl_port_unlock();
    return false;
  }

  lv_obj_t* const screen = lv_display_get_screen_active(display);
  lv_obj_clean(screen);
  lv_obj_remove_style_all(screen);
  lv_obj_set_style_bg_color(screen, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_remove_flag(screen, LV_OBJ_FLAG_SCROLLABLE);

  state.canvas = lv_canvas_create(screen);
  lv_obj_remove_style_all(state.canvas);
  lv_canvas_set_buffer(state.canvas, state.pixels, state.width, state.height,
                       LV_COLOR_FORMAT_RGB565);
  lv_obj_set_pos(state.canvas, 0, 0);

  state.title = create_label(screen, 4, 0xFFFFFF);
  lv_obj_set_style_bg_color(state.title, lv_color_hex(0x000000), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(state.title, LV_OPA_70, LV_PART_MAIN);

  state.detail = create_label(screen, state.height / 2 + 8, 0xFFFFFF);
  lv_obj_set_style_bg_color(state.detail, lv_color_hex(0x000000), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(state.detail, LV_OPA_70, LV_PART_MAIN);

  state.font_large = create_label(screen, state.height / 5, 0xFFFFFF);
  lv_obj_set_style_text_font(
      state.font_large,
      fonts.resolve({.family = kMontserratFontFamily, .size_px = 48}),
      LV_PART_MAIN);
  lv_label_set_text(state.font_large, "00:11.88");

  state.font_small = create_label(screen, state.height * 3 / 5, 0xE8E8E8);
  lv_obj_set_style_text_font(
      state.font_small,
      fonts.resolve({.family = kMontserratFontFamily, .size_px = 24}),
      LV_PART_MAIN);
  lv_label_set_text(state.font_small, "RGB 565 Aa 0123");

  state.moving_vertical = lv_obj_create(screen);
  lv_obj_remove_style_all(state.moving_vertical);
  lv_obj_set_size(state.moving_vertical, 3, state.height);
  lv_obj_set_style_bg_color(state.moving_vertical, lv_color_hex(0xFF00FF),
                            LV_PART_MAIN);
  lv_obj_set_style_bg_opa(state.moving_vertical, LV_OPA_COVER, LV_PART_MAIN);

  state.moving_horizontal = lv_obj_create(screen);
  lv_obj_remove_style_all(state.moving_horizontal);
  lv_obj_set_size(state.moving_horizontal, state.width, 3);
  lv_obj_set_style_bg_color(state.moving_horizontal, lv_color_hex(0x00FFFF),
                            LV_PART_MAIN);
  lv_obj_set_style_bg_opa(state.moving_horizontal, LV_OPA_COVER, LV_PART_MAIN);

  render_page(config.initial_page);
  state.last_counter_ms = lv_tick_get();
  lv_timer_create(update, kAnimationPeriodMs, nullptr);
  lvgl_port_unlock();
  return true;
}

}  // namespace simcore::dashboard::display_diagnostics

#endif
