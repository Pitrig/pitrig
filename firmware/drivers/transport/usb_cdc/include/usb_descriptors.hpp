#pragma once

#include <cstdint>

#include "tinyusb.h"

namespace pitrig::transport::usb_descriptors {

extern const tusb_desc_device_t kDevice;
extern const std::uint8_t kFullSpeedConfiguration[];
#if TUD_OPT_HIGH_SPEED
extern const tusb_desc_device_qualifier_t kQualifier;
extern const std::uint8_t kHighSpeedConfiguration[];
#endif
extern const char* kStrings[];
extern const int kStringCount;
#if CFG_TUD_HID
extern const std::uint8_t kGamepadReport[];
extern const std::uint16_t kGamepadReportLength;
#endif

}
