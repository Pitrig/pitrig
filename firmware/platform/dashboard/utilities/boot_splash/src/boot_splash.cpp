#include "boot_splash.hpp"

#include <algorithm>
#include <cstdint>

#include "esp_lvgl_port.h"
#include "display.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"
#include "splash_glow.hpp"

namespace pitrig::dashboard::boot_splash {
namespace {

constexpr std::uint32_t kRefreshTimeoutMs = 1'000;
constexpr std::int32_t kMinimumBorderPx = 4;
constexpr std::int32_t kSegmentsPerPerimeter = 96;

#if CONFIG_PITRIG_FACTORY_BOARD_GUITION_JC1060P470C
constexpr std::int32_t kDisplayWidth = 1'024;
constexpr std::int32_t kDisplayHeight = 600;
constexpr std::int32_t kLogoSize = 240;
extern const std::uint8_t kLogoData[]
    asm("_binary_logo_480x480_rgb565_start");
#elif CONFIG_PITRIG_FACTORY_BOARD_GUITION_ESP32_4848S040
constexpr std::int32_t kDisplayWidth = 480;
constexpr std::int32_t kDisplayHeight = 480;
constexpr std::int32_t kLogoSize = 240;
extern const std::uint8_t kLogoData[]
    asm("_binary_logo_480x480_rgb565_start");
#else
constexpr std::int32_t kDisplayWidth = 320;
constexpr std::int32_t kDisplayHeight = 170;
constexpr std::int32_t kLogoSize = 85;
extern const std::uint8_t kLogoData[]
    asm("_binary_logo_320x170_rgb565_start");
#endif

struct Splash {
  lv_obj_t* container{};
  std::uint32_t shown_tick{};
  bool dismissing{};
};

Splash g_splash{};

const lv_image_dsc_t kLogo{
    .header =
        {
            .magic = LV_IMAGE_HEADER_MAGIC,
            .cf = LV_COLOR_FORMAT_RGB565,
            .flags = 0,
            .w = kLogoSize,
            .h = kLogoSize,
            .stride = kLogoSize * sizeof(std::uint16_t),
            .reserved_2 = 0,
        },
    .data_size = kLogoSize * kLogoSize * sizeof(std::uint16_t),
    .data = kLogoData,
    .reserved = nullptr,
    .reserved_2 = nullptr,
};

const lv_image_dsc_t* find_asset(const lv_display_t* const display) {
  const std::int32_t width = lv_display_get_horizontal_resolution(display);
  const std::int32_t height = lv_display_get_vertical_resolution(display);
  return width == kDisplayWidth && height == kDisplayHeight ? &kLogo : nullptr;
}

void release() {
  glow::detach();
  if (g_splash.container != nullptr) {
    lv_obj_delete(g_splash.container);
  }
  g_splash = {};
}

[[nodiscard]] bool build(lv_display_t* const display, lv_obj_t* const layer,
                         const lv_image_dsc_t& asset) {
  g_splash.container = lv_obj_create(layer);
  if (g_splash.container == nullptr) {
    return false;
  }
  lv_obj_remove_style_all(g_splash.container);
  lv_obj_set_pos(g_splash.container, 0, 0);
  lv_obj_set_size(g_splash.container,
                  lv_display_get_horizontal_resolution(display),
                  lv_display_get_vertical_resolution(display));
  lv_obj_set_style_bg_color(g_splash.container, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(g_splash.container, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_remove_flag(g_splash.container, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(g_splash.container, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_t* const logo = lv_image_create(g_splash.container);
  lv_image_set_src(logo, &asset);
  lv_obj_center(logo);

  const std::int32_t width = lv_display_get_horizontal_resolution(display);
  const std::int32_t height = lv_display_get_vertical_resolution(display);
  const std::int32_t side = kLogoSize + 2 * (kLogoSize / 6);
  glow::attach({
      .container = g_splash.container,
      .x = (width - side) / 2,
      .y = (height - side) / 2,
      .width = side,
      .height = side,
      .thickness = std::max<std::int32_t>(kMinimumBorderPx, kLogoSize / 30),
      .segment = std::max<std::int32_t>(1, 4 * side / kSegmentsPerPerimeter),
      .corner = side / 5,
  });
  return true;
}

}

bool show(lv_display_t* const display, lv_obj_t* const layer) {
  if (display == nullptr || layer == nullptr ||
      g_splash.container != nullptr || !lvgl_port_lock(0)) {
    return false;
  }

  const lv_image_dsc_t* const asset = find_asset(display);
  if (asset == nullptr || !build(display, layer, *asset)) {
    lvgl_port_unlock();
    return false;
  }
  lvgl_port_unlock();

  if (!pitrig::display::refresh_and_wait(display, kRefreshTimeoutMs)) {
    if (lvgl_port_lock(0)) {
      release();
      lvgl_port_unlock();
    }
    return false;
  }

  g_splash.shown_tick = lv_tick_get();
  return true;
}

void dismiss(const std::uint32_t minimum_visible_ms) {
  if (g_splash.container == nullptr || g_splash.dismissing) {
    return;
  }
  g_splash.dismissing = true;
  const std::uint32_t visible_ms = lv_tick_elaps(g_splash.shown_tick);
  if (visible_ms < minimum_visible_ms) {
    vTaskDelay(pdMS_TO_TICKS(minimum_visible_ms - visible_ms) + 1);
  }
  if (!lvgl_port_lock(0)) {
    return;
  }
  release();
  lvgl_port_unlock();
}

}
