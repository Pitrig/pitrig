#include "boot_splash.hpp"

#include <algorithm>
#include <cstdint>

#include "display.hpp"
#include "esp_lvgl_port.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lvgl.h"

namespace pitrig::dashboard::boot_splash {
namespace {

constexpr std::uint32_t kRefreshTimeoutMs = 1'000;
constexpr std::int32_t kMinimumBorderPx = 4;
constexpr std::int32_t kSegmentsPerPerimeter = 96;
constexpr std::int32_t kLargeLogoPx = 240;
constexpr std::int32_t kSmallLogoPx = 85;

extern const std::uint8_t kLargeLogoData[] asm("_binary_logo_480x480_rgb565_start");
extern const std::uint8_t kSmallLogoData[] asm("_binary_logo_320x170_rgb565_start");

const lv_image_dsc_t kLargeLogo{
    .header =
        {
            .magic = LV_IMAGE_HEADER_MAGIC,
            .cf = LV_COLOR_FORMAT_RGB565,
            .flags = 0,
            .w = kLargeLogoPx,
            .h = kLargeLogoPx,
            .stride = kLargeLogoPx * sizeof(std::uint16_t),
            .reserved_2 = 0,
        },
    .data_size = kLargeLogoPx * kLargeLogoPx * sizeof(std::uint16_t),
    .data = kLargeLogoData,
    .reserved = nullptr,
    .reserved_2 = nullptr,
};

const lv_image_dsc_t kSmallLogo{
    .header =
        {
            .magic = LV_IMAGE_HEADER_MAGIC,
            .cf = LV_COLOR_FORMAT_RGB565,
            .flags = 0,
            .w = kSmallLogoPx,
            .h = kSmallLogoPx,
            .stride = kSmallLogoPx * sizeof(std::uint16_t),
            .reserved_2 = 0,
        },
    .data_size = kSmallLogoPx * kSmallLogoPx * sizeof(std::uint16_t),
    .data = kSmallLogoData,
    .reserved = nullptr,
    .reserved_2 = nullptr,
};

const lv_image_dsc_t* const kLogos[] = {&kLargeLogo, &kSmallLogo};

[[nodiscard]] std::int32_t glow_side(const std::int32_t logo_px) {
  return logo_px + 2 * (logo_px / 6);
}

const lv_image_dsc_t* find_asset(const lv_display_t* const display) {
  const std::int32_t width = lv_display_get_horizontal_resolution(display);
  const std::int32_t height = lv_display_get_vertical_resolution(display);
  for (const lv_image_dsc_t* const logo : kLogos) {
    const std::int32_t side = glow_side(static_cast<std::int32_t>(logo->header.w));
    if (side <= width && side <= height) {
      return logo;
    }
  }
  return nullptr;
}

}

void Splash::release() {
  glow_.detach();
  if (container_ != nullptr) {
    lv_obj_delete(container_);
    container_ = nullptr;
  }
  shown_tick_ = 0;
  dismissing_ = false;
}

bool Splash::build(lv_display_t* const display, lv_obj_t* const layer,
                   const lv_image_dsc_t& asset) {
  container_ = lv_obj_create(layer);
  if (container_ == nullptr) {
    return false;
  }
  const std::int32_t width = lv_display_get_horizontal_resolution(display);
  const std::int32_t height = lv_display_get_vertical_resolution(display);
  lv_obj_remove_style_all(container_);
  lv_obj_set_pos(container_, 0, 0);
  lv_obj_set_size(container_, width, height);
  lv_obj_set_style_bg_color(container_, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(container_, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_remove_flag(container_, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(container_, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_t* const logo = lv_image_create(container_);
  lv_image_set_src(logo, &asset);
  lv_obj_center(logo);

  const auto logo_px = static_cast<std::int32_t>(asset.header.w);
  const std::int32_t side = glow_side(logo_px);
  glow_.attach({
      .container = container_,
      .x = (width - side) / 2,
      .y = (height - side) / 2,
      .width = side,
      .height = side,
      .thickness = std::max<std::int32_t>(kMinimumBorderPx, logo_px / 30),
      .segment = std::max<std::int32_t>(1, 4 * side / kSegmentsPerPerimeter),
      .corner = side / 5,
  });
  return true;
}

bool Splash::show(lv_display_t* const display, lv_obj_t* const layer) {
  if (display == nullptr || layer == nullptr || !lvgl_port_lock(0)) {
    return false;
  }
  const lv_image_dsc_t* const asset = find_asset(display);
  if (container_ != nullptr || asset == nullptr || !build(display, layer, *asset)) {
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
  shown_tick_ = lv_tick_get();
  return true;
}

bool Splash::claim() {
  if (!lvgl_port_lock(0)) {
    return false;
  }
  const bool claimed = container_ != nullptr && !dismissing_;
  dismissing_ = dismissing_ || claimed;
  lvgl_port_unlock();
  return claimed;
}

void Splash::dismiss(const std::uint32_t minimum_visible_ms) {
  if (!claim()) {
    return;
  }
  const std::uint32_t visible_ms = lv_tick_elaps(shown_tick_);
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
