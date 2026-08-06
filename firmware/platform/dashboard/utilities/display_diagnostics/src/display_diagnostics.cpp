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
#if SIMCORE_DEBUG
#include "performance.hpp"
#endif

namespace simcore::dashboard::display_diagnostics {
namespace {

constexpr std::uint8_t kPageCount = 6;
constexpr std::uint8_t kPatternPage = 3;
constexpr std::uint8_t kFpsStressPage = 5;
constexpr std::uint32_t kAnimationPeriodMs = 8;
constexpr std::uint32_t kCounterPeriodMs = 100;
constexpr std::uint32_t kFpsWarmupMs = 2'000;
constexpr std::size_t kBufferAlignment = 64;
constexpr std::size_t kRgb888BytesPerPixel = 3;
constexpr std::array<const char*, kPageCount> kPageNames = {
    "GEOMETRY", "RGB888 GRADIENT", "D23..D0", "PCLK/TEARING",
    "FONT FRINGING", "FPS STRESS"};

struct State {
  Config config{};
  lv_obj_t* canvas{};
  lv_obj_t* fps_surface{};
  lv_obj_t* title{};
  lv_obj_t* detail{};
  lv_obj_t* font_large{};
  lv_obj_t* font_small{};
  lv_obj_t* moving_vertical{};
  lv_obj_t* moving_horizontal{};
  std::uint8_t* pixels{};
  std::size_t stride{};
  std::int32_t width{};
  std::int32_t height{};
  std::uint8_t page{};
  std::uint32_t page_started_ms{};
  std::uint32_t last_counter_ms{};
  std::uint32_t frame_counter{};
};

State state;

void write_rgb888(std::uint8_t* const pixel, const std::uint32_t color) {
  pixel[0] = static_cast<std::uint8_t>(color);
  pixel[1] = static_cast<std::uint8_t>(color >> 8);
  pixel[2] = static_cast<std::uint8_t>(color >> 16);
}

void set_pixel(const std::int32_t x, const std::int32_t y,
               const std::uint32_t color) {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
    return;
  }
  std::uint8_t* const pixel =
      state.pixels + static_cast<std::size_t>(y) * state.stride +
      static_cast<std::size_t>(x) * kRgb888BytesPerPixel;
  write_rgb888(pixel, color);
}

void fill(const std::uint32_t color) {
  for (std::int32_t y = 0; y < state.height; ++y) {
    std::uint8_t* pixel =
        state.pixels + static_cast<std::size_t>(y) * state.stride;
    for (std::int32_t x = 0; x < state.width; ++x) {
      write_rgb888(pixel, color);
      pixel += kRgb888BytesPerPixel;
    }
  }
}

void fill_rect(std::int32_t x, std::int32_t y, std::int32_t width,
               std::int32_t height, const std::uint32_t color) {
  const std::int32_t x0 = std::clamp<std::int32_t>(x, 0, state.width);
  const std::int32_t y0 = std::clamp<std::int32_t>(y, 0, state.height);
  const std::int32_t x1 =
      std::clamp<std::int32_t>(x + width, 0, state.width);
  const std::int32_t y1 =
      std::clamp<std::int32_t>(y + height, 0, state.height);
  for (std::int32_t row = y0; row < y1; ++row) {
    std::uint8_t* pixel =
        state.pixels + static_cast<std::size_t>(row) * state.stride +
        static_cast<std::size_t>(x0) * kRgb888BytesPerPixel;
    for (std::int32_t column = x0; column < x1; ++column) {
      write_rgb888(pixel, color);
      pixel += kRgb888BytesPerPixel;
    }
  }
}

void outline_rect(const std::int32_t x, const std::int32_t y,
                  const std::int32_t width, const std::int32_t height,
                  const std::uint32_t color) {
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
  show(state.fps_surface, false);
  show(state.detail, false);
  show(state.font_large, false);
  show(state.font_small, false);
  show(state.moving_vertical, false);
  show(state.moving_horizontal, false);
}

void render_geometry() {
  constexpr std::uint32_t black = 0x000000;
  constexpr std::uint32_t white = 0xFFFFFF;
  constexpr std::uint32_t red = 0xFF0000;
  constexpr std::uint32_t green = 0x00FF00;
  constexpr std::uint32_t blue = 0x0000FF;
  constexpr std::uint32_t gray = 0x404040;

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
  constexpr std::array<std::uint32_t, 8> bars = {
      0x000000, 0xFFFFFF, 0xFF0000, 0x00FF00,
      0x0000FF, 0xFFFF00, 0x00FFFF, 0xFF00FF,
  };
  fill(0x000000);

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
              (level << 16) | (level << 8) | level);
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
      fill_rect(x, y, 1, channel_height, color);
    }
  }
}

void render_patterns() {
  constexpr std::uint32_t black = 0x000000;
  constexpr std::uint32_t white = 0xFFFFFF;
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
  outline_rect(0, 0, state.width, state.height, 0xFF0000);
  fill_rect(half_width, 0, 1, state.height, 0x00FF00);
  fill_rect(0, half_height, state.width, 1, 0x0000FF);
  show(state.moving_vertical, true);
  show(state.moving_horizontal, true);
}

void render_data_bits() {
  fill(0x000000);
  constexpr std::int32_t bit_count = 24;
  const std::int32_t half_height = state.height / 2;
  for (std::int32_t column = 0; column < bit_count; ++column) {
    const std::int32_t x0 = column * state.width / bit_count;
    const std::int32_t x1 = (column + 1) * state.width / bit_count;
    const std::uint32_t bit = 1U << (bit_count - 1 - column);
    fill_rect(x0, 0, x1 - x0, half_height, bit);
    fill_rect(x0, half_height, x1 - x0, state.height - half_height,
              0xFFFFFFU ^ bit);
    fill_rect(x0, 0, 1, state.height, 0x000000);
  }
  fill_rect(0, half_height, state.width, 1, 0x000000);
  outline_rect(0, 0, state.width, state.height, 0xFFFFFF);
}

void render_fonts() {
  constexpr std::array<std::uint32_t, 4> backgrounds = {
      0x000000, 0x202020, 0x000080, 0x780078};
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

void render_fps_stress() {
  show(state.fps_surface, true);
  show(state.detail, true);
  show(state.moving_vertical, true);
  show(state.moving_horizontal, true);
#if SIMCORE_DEBUG
  lv_label_set_text(state.detail,
                    "Warming up for 2s...\nFull-screen RGB888 + PPA");
#else
  lv_label_set_text(state.detail,
                    "Full-screen RGB888 + PPA\nEnable SIMCORE_DEBUG for FPS");
#endif
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
    case kFpsStressPage:
      render_fps_stress();
      break;
    default:
      break;
  }
  lv_obj_invalidate(state.canvas);
}

void update(lv_timer_t*) {
  const std::uint32_t now = lv_tick_get();
  ++state.frame_counter;

  const std::uint32_t page_duration_ms =
      state.page == kFpsStressPage ? state.config.fps_page_duration_ms
                                   : state.config.page_duration_ms;
  if (state.config.auto_cycle && page_duration_ms > 0 &&
      lv_tick_elaps(state.page_started_ms) >= page_duration_ms) {
    render_page((state.page + 1) % kPageCount);
  }

  if (state.page == kPatternPage || state.page == kFpsStressPage) {
    lv_obj_set_x(
        state.moving_vertical,
        static_cast<std::int32_t>(
            (now / 5) % std::max<std::int32_t>(1, state.width)));
    lv_obj_set_y(
        state.moving_horizontal,
        static_cast<std::int32_t>(
            (now / 7) % std::max<std::int32_t>(1, state.height)));
  }

  if (state.page == kFpsStressPage) {
    const std::uint16_t hue = static_cast<std::uint16_t>((now / 8) % 360);
    lv_obj_set_style_bg_color(state.fps_surface,
                              lv_color_hsv_to_rgb(hue, 100, 100),
                              LV_PART_MAIN);
  }

  if (lv_tick_elaps(state.last_counter_ms) >= kCounterPeriodMs) {
    state.last_counter_ms = now;
    char title[64];
    std::snprintf(title, sizeof(title), "%u/%u %s tick=%lu",
                  static_cast<unsigned>(state.page + 1),
                  static_cast<unsigned>(kPageCount), kPageNames[state.page],
                  static_cast<unsigned long>(state.frame_counter));
    lv_label_set_text(state.title, title);
#if SIMCORE_DEBUG
    if (state.page == kFpsStressPage &&
        lv_tick_elaps(state.page_started_ms) >= kFpsWarmupMs) {
      const performance::PerformanceStats stats = performance::get_stats();
      char detail[160];
      std::snprintf(
          detail, sizeof(detail),
          "FULL-SCREEN RGB888 + PPA\n"
          "FPS %.1f | render %.2fms | flush %.2fms\n"
          "CPU %.0f%% / %.0f%%",
          static_cast<double>(stats.fps),
          static_cast<double>(stats.render_time_us) / 1'000.0,
          static_cast<double>(stats.flush_time_us) / 1'000.0,
          static_cast<double>(stats.cpu_core0),
          static_cast<double>(stats.cpu_core1));
      lv_label_set_text(state.detail, detail);
    }
#endif
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
  state.stride =
      lv_draw_buf_width_to_stride(state.width, LV_COLOR_FORMAT_RGB888);
  const std::size_t buffer_bytes = state.stride * state.height;
  state.pixels = static_cast<std::uint8_t*>(heap_caps_aligned_alloc(
      kBufferAlignment, buffer_bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (state.pixels == nullptr) {
    state.pixels = static_cast<std::uint8_t*>(heap_caps_aligned_alloc(
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
                       LV_COLOR_FORMAT_RGB888);
  lv_obj_set_pos(state.canvas, 0, 0);

  state.fps_surface = lv_obj_create(screen);
  lv_obj_remove_style_all(state.fps_surface);
  lv_obj_set_pos(state.fps_surface, 0, 0);
  lv_obj_set_size(state.fps_surface, state.width, state.height);
  lv_obj_set_style_bg_color(state.fps_surface, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(state.fps_surface, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_remove_flag(state.fps_surface, LV_OBJ_FLAG_SCROLLABLE);

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
  lv_label_set_text(state.font_small, "RGB 888 Aa 0123");

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
