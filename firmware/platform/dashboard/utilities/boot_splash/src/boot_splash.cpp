#include "boot_splash.hpp"

#include <array>
#include <cstddef>
#include <cstdint>

#include "esp_lvgl_port.h"
#include "display.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace simcore::dashboard::boot_splash {
namespace {

constexpr std::int32_t kLandscapeDisplayWidth = 320;
constexpr std::int32_t kLandscapeDisplayHeight = 170;
constexpr std::int32_t kLandscapeLogoSize = 85;
constexpr std::int32_t kSquareDisplaySize = 480;
constexpr std::int32_t kSquareLogoSize = 240;
constexpr std::uint32_t kRefreshTimeoutMs = 1'000;

extern const std::uint8_t kLogo320x170Data[]
    asm("_binary_logo_320x170_rgb565_start");
extern const std::uint8_t kLogo480x480Data[]
    asm("_binary_logo_480x480_rgb565_start");

const lv_image_dsc_t kLogo320x170{
    .header =
        {
            .magic = LV_IMAGE_HEADER_MAGIC,
            .cf = LV_COLOR_FORMAT_RGB565,
            .flags = 0,
            .w = kLandscapeLogoSize,
            .h = kLandscapeLogoSize,
            .stride = kLandscapeLogoSize * sizeof(std::uint16_t),
            .reserved_2 = 0,
        },
    .data_size =
        kLandscapeLogoSize * kLandscapeLogoSize * sizeof(std::uint16_t),
    .data = kLogo320x170Data,
    .reserved = nullptr,
    .reserved_2 = nullptr,
};

const lv_image_dsc_t kLogo480x480{
    .header =
        {
            .magic = LV_IMAGE_HEADER_MAGIC,
            .cf = LV_COLOR_FORMAT_RGB565,
            .flags = 0,
            .w = kSquareLogoSize,
            .h = kSquareLogoSize,
            .stride = kSquareLogoSize * sizeof(std::uint16_t),
            .reserved_2 = 0,
        },
    .data_size = kSquareLogoSize * kSquareLogoSize * sizeof(std::uint16_t),
    .data = kLogo480x480Data,
    .reserved = nullptr,
    .reserved_2 = nullptr,
};

struct DisplayAsset {
  std::int32_t width;
  std::int32_t height;
  const lv_image_dsc_t* image;
};

constexpr std::array<DisplayAsset, 2> kDisplayAssets{{
    {kLandscapeDisplayWidth, kLandscapeDisplayHeight, &kLogo320x170},
    {kSquareDisplaySize, kSquareDisplaySize, &kLogo480x480},
}};

const lv_image_dsc_t* find_asset(const lv_display_t* const display) {
  const std::int32_t width = lv_display_get_horizontal_resolution(display);
  const std::int32_t height = lv_display_get_vertical_resolution(display);
  for (const DisplayAsset& asset : kDisplayAssets) {
    if (asset.width == width && asset.height == height) {
      return asset.image;
    }
  }
  return nullptr;
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
