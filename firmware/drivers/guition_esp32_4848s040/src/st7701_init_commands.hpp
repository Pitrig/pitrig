#pragma once

#include <cstdint>

#include "esp_lcd_st7701.h"

namespace pitrig::display::drivers::guition_esp32_4848s040 {
namespace {

constexpr std::uint8_t kBank0[] = {0x77, 0x01, 0x00, 0x00, 0x10};
constexpr std::uint8_t kLineSetting[] = {0x3B, 0x00};
constexpr std::uint8_t kPorchControl[] = {0x0D, 0x02};
constexpr std::uint8_t kInversionControl[] = {0x31, 0x05};
constexpr std::uint8_t kRgbControl[] = {0x00};
constexpr std::uint8_t kPositiveGamma[] = {
    0x00, 0x11, 0x18, 0x0E, 0x11, 0x06, 0x07, 0x08, 0x07, 0x22, 0x04, 0x12, 0x0F, 0xAA, 0x31, 0x18,
};
constexpr std::uint8_t kNegativeGamma[] = {
    0x00, 0x11, 0x19, 0x0E, 0x12, 0x07, 0x08, 0x08, 0x08, 0x22, 0x04, 0x11, 0x11, 0xA9, 0x32, 0x18,
};
constexpr std::uint8_t kBank1[] = {0x77, 0x01, 0x00, 0x00, 0x11};
constexpr std::uint8_t kVop[] = {0x60};
constexpr std::uint8_t kVcom[] = {0x32};
constexpr std::uint8_t kVgh[] = {0x07};
constexpr std::uint8_t kTestCommand[] = {0x80};
constexpr std::uint8_t kVgl[] = {0x49};
constexpr std::uint8_t kPowerControl1[] = {0x85};
constexpr std::uint8_t kPowerControl2[] = {0x21};
constexpr std::uint8_t kVdv[] = {0x78};
constexpr std::uint8_t kVrh[] = {0x78};
constexpr std::uint8_t kPowerControl3[] = {0x00, 0x1B, 0x02};
constexpr std::uint8_t kEqualize1[] = {
    0x08, 0xA0, 0x00, 0x00, 0x07, 0xA0, 0x00, 0x00, 0x00, 0x44, 0x44,
};
constexpr std::uint8_t kEqualize2[] = {
    0x11, 0x11, 0x44, 0x44, 0xED, 0xA0, 0x00, 0x00, 0xEC, 0xA0, 0x00, 0x00,
};
constexpr std::uint8_t kEqualize3[] = {0x00, 0x00, 0x11, 0x11};
constexpr std::uint8_t kEqualize4[] = {0x44, 0x44};
constexpr std::uint8_t kEqualize5[] = {
    0x0A, 0xE9, 0xD8, 0xA0, 0x0C, 0xEB, 0xD8, 0xA0, 0x0E, 0xED, 0xD8, 0xA0, 0x10, 0xEF, 0xD8, 0xA0,
};
constexpr std::uint8_t kEqualize6[] = {0x00, 0x00, 0x11, 0x11};
constexpr std::uint8_t kEqualize7[] = {0x44, 0x44};
constexpr std::uint8_t kEqualize8[] = {
    0x09, 0xE8, 0xD8, 0xA0, 0x0B, 0xEA, 0xD8, 0xA0, 0x0D, 0xEC, 0xD8, 0xA0, 0x0F, 0xEE, 0xD8, 0xA0,
};
constexpr std::uint8_t kEqualize9[] = {0x02, 0x00, 0xE4, 0xE4, 0x88, 0x00, 0x40};
constexpr std::uint8_t kEqualize10[] = {0x3C, 0x00};
constexpr std::uint8_t kEqualize11[] = {
    0xAB, 0x89, 0x76, 0x54, 0x02, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x20, 0x45, 0x67, 0x98, 0xBA,
};
constexpr std::uint8_t kBank3[] = {0x77, 0x01, 0x00, 0x00, 0x13};
constexpr std::uint8_t kGateControl[] = {0xE4};
constexpr std::uint8_t kCommand2Disabled[] = {0x77, 0x01, 0x00, 0x00, 0x00};
constexpr std::uint8_t kControllerColorMode[] = {0x60};

constexpr st7701_lcd_init_cmd_t kInitializationCommands[] = {
    {0xFF, kBank0, sizeof(kBank0), 0},
    {0xC0, kLineSetting, sizeof(kLineSetting), 0},
    {0xC1, kPorchControl, sizeof(kPorchControl), 0},
    {0xC2, kInversionControl, sizeof(kInversionControl), 0},
    {0xCD, kRgbControl, sizeof(kRgbControl), 0},
    {0xB0, kPositiveGamma, sizeof(kPositiveGamma), 0},
    {0xB1, kNegativeGamma, sizeof(kNegativeGamma), 0},
    {0xFF, kBank1, sizeof(kBank1), 0},
    {0xB0, kVop, sizeof(kVop), 0},
    {0xB1, kVcom, sizeof(kVcom), 0},
    {0xB2, kVgh, sizeof(kVgh), 0},
    {0xB3, kTestCommand, sizeof(kTestCommand), 0},
    {0xB5, kVgl, sizeof(kVgl), 0},
    {0xB7, kPowerControl1, sizeof(kPowerControl1), 0},
    {0xB8, kPowerControl2, sizeof(kPowerControl2), 0},
    {0xC1, kVdv, sizeof(kVdv), 0},
    {0xC2, kVrh, sizeof(kVrh), 0},
    {0xE0, kPowerControl3, sizeof(kPowerControl3), 0},
    {0xE1, kEqualize1, sizeof(kEqualize1), 0},
    {0xE2, kEqualize2, sizeof(kEqualize2), 0},
    {0xE3, kEqualize3, sizeof(kEqualize3), 0},
    {0xE4, kEqualize4, sizeof(kEqualize4), 0},
    {0xE5, kEqualize5, sizeof(kEqualize5), 0},
    {0xE6, kEqualize6, sizeof(kEqualize6), 0},
    {0xE7, kEqualize7, sizeof(kEqualize7), 0},
    {0xE8, kEqualize8, sizeof(kEqualize8), 0},
    {0xEB, kEqualize9, sizeof(kEqualize9), 0},
    {0xEC, kEqualize10, sizeof(kEqualize10), 0},
    {0xED, kEqualize11, sizeof(kEqualize11), 0},
    {0xFF, kBank3, sizeof(kBank3), 0},
    {0xE5, kGateControl, sizeof(kGateControl), 0},
    {0xFF, kCommand2Disabled, sizeof(kCommand2Disabled), 0},
    {0x3A, kControllerColorMode, sizeof(kControllerColorMode), 0},
    {0x11, nullptr, 0, 120},
    {0x29, nullptr, 0, 0},
};

}

}
