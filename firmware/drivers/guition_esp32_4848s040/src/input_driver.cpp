#include "gt911_touch.hpp"
#include "guition_input_driver.hpp"

namespace pitrig::input::drivers::guition_esp32_4848s040 {
namespace {

constexpr gpio_num_t kSdaPin = GPIO_NUM_19;
constexpr gpio_num_t kSclPin = GPIO_NUM_45;
constexpr std::uint32_t kClockHz = 400'000;
constexpr std::uint16_t kHorizontalResolution = 480;
constexpr std::uint16_t kVerticalResolution = 480;

constexpr gt911::Panel kPanel = {
    .pins = {.sda = kSdaPin,
             .scl = kSclPin,
             .reset = GPIO_NUM_NC,
             .interrupt = GPIO_NUM_NC},
    .clock_hz = kClockHz,
    .horizontal_resolution = kHorizontalResolution,
    .vertical_resolution = kVerticalResolution,
    .swap_xy = false,
    .mirror_x = false,
    .mirror_y = false,
};

driver::Configuration initialize() { return gt911::create(kPanel); }

constexpr driver::Driver kDriver = {
    .name = "guition_esp32_4848s040_gt911",
    .initialize = initialize,
};

}

const driver::Driver& get() { return kDriver; }

}
