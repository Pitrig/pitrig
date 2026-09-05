#include "gt911_touch.hpp"

#include "driver/i2c_master.h"
#include "esp_err.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_touch_gt911.h"
#include "esp_log.h"

namespace pitrig::input::drivers::gt911 {
namespace {

constexpr char kTag[] = "gt911";
constexpr int kGlitchIgnoreCount = 7;
constexpr std::uint16_t kFirstScannedAddress = 0x08;
constexpr std::uint16_t kLastScannedAddress = 0x77;
constexpr int kProbeTimeoutMs = 10;

esp_lcd_touch_io_gt911_config_t kAddressCandidates[] = {
    {.dev_addr = ESP_LCD_TOUCH_IO_I2C_GT911_ADDRESS},
    {.dev_addr = ESP_LCD_TOUCH_IO_I2C_GT911_ADDRESS_BACKUP},
};

std::uint64_t pin_mask(gpio_num_t pin) {
  return pin == GPIO_NUM_NC ? 0ULL : 1ULL << static_cast<int>(pin);
}

void log_bus(i2c_master_bus_handle_t bus, const Pins& pins) {
  const std::uint64_t mask = pin_mask(pins.reset) | pin_mask(pins.interrupt);
  if (mask != 0ULL) {
    gpio_config_t input_configuration = {};
    input_configuration.pin_bit_mask = mask;
    input_configuration.mode = GPIO_MODE_INPUT;
    input_configuration.pull_up_en = GPIO_PULLUP_DISABLE;
    input_configuration.pull_down_en = GPIO_PULLDOWN_DISABLE;
    input_configuration.intr_type = GPIO_INTR_DISABLE;
    if (gpio_config(&input_configuration) == ESP_OK) {
      ESP_LOGW(kTag, "Idle levels: reset(%d)=%d interrupt(%d)=%d",
               static_cast<int>(pins.reset),
               pins.reset == GPIO_NUM_NC ? -1 : gpio_get_level(pins.reset),
               static_cast<int>(pins.interrupt),
               pins.interrupt == GPIO_NUM_NC ? -1
                                             : gpio_get_level(pins.interrupt));
    }
  }

  ESP_LOGW(kTag, "Scanning I2C bus on sda=%d scl=%d (GT911 answers at 0x%02X or 0x%02X)",
           static_cast<int>(pins.sda), static_cast<int>(pins.scl),
           ESP_LCD_TOUCH_IO_I2C_GT911_ADDRESS,
           ESP_LCD_TOUCH_IO_I2C_GT911_ADDRESS_BACKUP);
  int found = 0;
  for (std::uint16_t address = kFirstScannedAddress;
       address <= kLastScannedAddress; ++address) {
    if (i2c_master_probe(bus, address, kProbeTimeoutMs) == ESP_OK) {
      ESP_LOGW(kTag, "  device answered at 0x%02X", address);
      ++found;
    }
  }
  ESP_LOGW(kTag, "Scan complete: %d device(s) answered", found);
}

}

driver::Configuration create(const Panel& panel) {
  i2c_master_bus_config_t bus_configuration = {};
  bus_configuration.i2c_port = I2C_NUM_0;
  bus_configuration.sda_io_num = panel.pins.sda;
  bus_configuration.scl_io_num = panel.pins.scl;
  bus_configuration.clk_source = I2C_CLK_SRC_DEFAULT;
  bus_configuration.glitch_ignore_cnt = kGlitchIgnoreCount;
  bus_configuration.flags.enable_internal_pullup = true;

  i2c_master_bus_handle_t bus = nullptr;
  if (i2c_new_master_bus(&bus_configuration, &bus) != ESP_OK) {
    ESP_LOGE(kTag, "I2C bus on sda=%d scl=%d is unavailable",
             static_cast<int>(panel.pins.sda), static_cast<int>(panel.pins.scl));
    return {.touch = nullptr};
  }

  esp_lcd_touch_config_t touch_configuration = {};
  touch_configuration.x_max = panel.horizontal_resolution;
  touch_configuration.y_max = panel.vertical_resolution;
  touch_configuration.rst_gpio_num = panel.pins.reset;
  touch_configuration.int_gpio_num = panel.pins.interrupt;
  touch_configuration.levels.reset = 0;
  touch_configuration.levels.interrupt = 0;
  touch_configuration.flags.swap_xy = panel.swap_xy ? 1U : 0U;
  touch_configuration.flags.mirror_x = panel.mirror_x ? 1U : 0U;
  touch_configuration.flags.mirror_y = panel.mirror_y ? 1U : 0U;

  for (esp_lcd_touch_io_gt911_config_t& candidate : kAddressCandidates) {
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
    esp_lcd_panel_io_i2c_config_t io_configuration =
        ESP_LCD_TOUCH_IO_I2C_GT911_CONFIG();
#pragma GCC diagnostic pop
    io_configuration.scl_speed_hz = panel.clock_hz;
    io_configuration.dev_addr = candidate.dev_addr;

    esp_lcd_panel_io_handle_t io = nullptr;
    if (esp_lcd_new_panel_io_i2c(bus, &io_configuration, &io) != ESP_OK) {
      continue;
    }

    touch_configuration.driver_data = &candidate;
    esp_lcd_touch_handle_t touch = nullptr;
    if (esp_lcd_touch_new_i2c_gt911(io, &touch_configuration, &touch) ==
        ESP_OK) {
      ESP_LOGI(kTag, "GT911 ready at 0x%02X", candidate.dev_addr);
      return {.touch = touch};
    }
    (void)esp_lcd_panel_io_del(io);
  }

  ESP_LOGE(kTag, "GT911 did not answer at any known address");
  log_bus(bus, panel.pins);
  (void)i2c_del_master_bus(bus);
  return {.touch = nullptr};
}

}
