#include "gt911_touch.hpp"
#include "guition_jc1060p470c_input_driver.hpp"

namespace pitrig::input::drivers::guition_jc1060p470c {
namespace {

constexpr gpio_num_t kSdaPin = GPIO_NUM_7;
constexpr gpio_num_t kSclPin = GPIO_NUM_8;
constexpr gpio_num_t kResetPin = GPIO_NUM_22;
constexpr gpio_num_t kInterruptPin = GPIO_NUM_21;
constexpr std::uint32_t kClockHz = 400'000;
constexpr std::uint16_t kHorizontalResolution = 1'024;
constexpr std::uint16_t kVerticalResolution = 600;

constexpr gt911::Panel kPanel = {
    .pins = {.sda = kSdaPin,
             .scl = kSclPin,
             .reset = kResetPin,
             .interrupt = kInterruptPin},
    .clock_hz = kClockHz,
    .horizontal_resolution = kHorizontalResolution,
    .vertical_resolution = kVerticalResolution,
    .swap_xy = false,
    .mirror_x = false,
    .mirror_y = false,
};

driver::Configuration initialize() { return gt911::create(kPanel); }

constexpr driver::Driver kDriver = {
    .name = "guition_jc1060p470c_gt911",
    .initialize = initialize,
};

}

const driver::Driver& get() { return kDriver; }

}
