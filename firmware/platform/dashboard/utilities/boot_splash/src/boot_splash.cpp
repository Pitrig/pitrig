#include "boot_splash.hpp"

#include <cstdint>

#include "esp_lvgl_port.h"
#include "display.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

namespace simcore::dashboard::boot_splash {
namespace {

constexpr std::uint32_t kRefreshTimeoutMs = 1'000;

#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
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

}  // namespace

bool show(lv_display_t* const display,
          const std::uint32_t minimum_duration_ms,
          const bool retain_after_minimum_duration) {
  if (display == nullptr || !lvgl_port_lock(0)) {
    return false;
  }

  const lv_image_dsc_t* const image_asset = find_asset(display);
  lv_obj_t* const screen = lv_display_get_screen_active(display);
  if (image_asset == nullptr || screen == nullptr) {
    lvgl_port_unlock();
    return false;
  }

  lv_obj_t* const image = lv_image_create(screen);
  if (image == nullptr) {
    lvgl_port_unlock();
    return false;
  }
  lv_image_set_src(image, image_asset);
  lv_obj_center(image);
  lvgl_port_unlock();

  if (!simcore::display::refresh_and_wait(display, kRefreshTimeoutMs)) {
    if (lvgl_port_lock(0)) {
      lv_obj_delete(image);
      lvgl_port_unlock();
    }
    return false;
  }

  if (retain_after_minimum_duration) {
    return true;
  }

  // One extra tick compensates for entering the delay immediately before a
  // scheduler tick, keeping the visible interval at or above the requested time.
  vTaskDelay(pdMS_TO_TICKS(minimum_duration_ms) + 1);

  if (!lvgl_port_lock(0)) {
    return false;
  }
  lv_obj_delete(image);
  lvgl_port_unlock();
  return true;
}

}  // namespace simcore::dashboard::boot_splash
