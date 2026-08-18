#pragma once

#include <cstdint>

#include "tinyusb.h"

// What a host sees when this board enumerates: vendor and product ids, the
// interface layout, the endpoints, and the strings. It is a product identity
// table rather than transport logic, and it was two thirds of the driver.
namespace simcore::transport::usb_descriptors {

extern const tusb_desc_device_t kDevice;
extern const std::uint8_t kFullSpeedConfiguration[];
#if TUD_OPT_HIGH_SPEED
extern const tusb_desc_device_qualifier_t kQualifier;
extern const std::uint8_t kHighSpeedConfiguration[];
#endif
extern const char* kStrings[];
extern const int kStringCount;

}  // namespace simcore::transport::usb_descriptors
