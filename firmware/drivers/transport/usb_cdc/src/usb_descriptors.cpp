#include "usb_descriptors.hpp"

#include <cstddef>
#include <cstdint>
#include <cstdio>

#include "esp_mac.h"

namespace pitrig::transport::usb_descriptors {
namespace {

constexpr std::uint16_t kUsbVendorId = TINYUSB_ESPRESSIF_VID;
constexpr std::uint16_t kUsbProductId = 0x4001;
constexpr std::uint16_t kUsbDeviceVersion = 0x0100;
constexpr std::uint8_t kUsbCdcInterface = 0;
constexpr std::uint8_t kUsbCdcStringIndex = 4;
constexpr std::uint8_t kUsbCdcNotificationEndpoint = 0x81;
constexpr std::uint8_t kUsbCdcOutputEndpoint = 0x02;
constexpr std::uint8_t kUsbCdcInputEndpoint = 0x82;
#if CFG_TUD_HID
constexpr std::uint8_t kUsbInterfaceCount = 3;
constexpr std::uint8_t kUsbGamepadInterface = 2;
constexpr std::uint8_t kUsbGamepadStringIndex = 5;
constexpr std::uint8_t kUsbGamepadInputEndpoint = 0x83;
constexpr std::uint8_t kUsbGamepadEndpointSize = 16;
constexpr std::uint8_t kUsbGamepadPollIntervalMs = 4;
constexpr std::uint16_t kUsbConfigurationLength =
    TUD_CONFIG_DESC_LEN + TUD_CDC_DESC_LEN + TUD_HID_DESC_LEN;
#else
constexpr std::uint8_t kUsbInterfaceCount = 2;
constexpr std::uint16_t kUsbConfigurationLength = TUD_CONFIG_DESC_LEN + TUD_CDC_DESC_LEN;
#endif

}

#if CFG_TUD_HID
const std::uint8_t kGamepadReport[] = {TUD_HID_REPORT_DESC_GAMEPAD()};
const std::uint16_t kGamepadReportLength = sizeof(kGamepadReport);
#endif

const tusb_desc_device_t kDevice{
    .bLength = sizeof(tusb_desc_device_t),
    .bDescriptorType = TUSB_DESC_DEVICE,
    .bcdUSB = 0x0200,
    .bDeviceClass = TUSB_CLASS_MISC,
    .bDeviceSubClass = MISC_SUBCLASS_COMMON,
    .bDeviceProtocol = MISC_PROTOCOL_IAD,
    .bMaxPacketSize0 = CFG_TUD_ENDPOINT0_SIZE,
    .idVendor = kUsbVendorId,
    .idProduct = kUsbProductId,
    .bcdDevice = kUsbDeviceVersion,
    .iManufacturer = 1,
    .iProduct = 2,
    .iSerialNumber = 3,
    .bNumConfigurations = 1,
};

const std::uint8_t kFullSpeedConfiguration[] = {
    TUD_CONFIG_DESCRIPTOR(1, kUsbInterfaceCount, 0, kUsbConfigurationLength,
                          TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP, 100),
    TUD_CDC_DESCRIPTOR(kUsbCdcInterface, kUsbCdcStringIndex, kUsbCdcNotificationEndpoint, 8,
                       kUsbCdcOutputEndpoint, kUsbCdcInputEndpoint, 64),
#if CFG_TUD_HID
    TUD_HID_DESCRIPTOR(kUsbGamepadInterface, kUsbGamepadStringIndex, HID_ITF_PROTOCOL_NONE,
                       sizeof(kGamepadReport), kUsbGamepadInputEndpoint, kUsbGamepadEndpointSize,
                       kUsbGamepadPollIntervalMs),
#endif
};

static_assert(sizeof(kFullSpeedConfiguration) == kUsbConfigurationLength,
              "The full-speed configuration descriptor must match its declared length");

#if TUD_OPT_HIGH_SPEED
const tusb_desc_device_qualifier_t kQualifier{
    .bLength = sizeof(tusb_desc_device_qualifier_t),
    .bDescriptorType = TUSB_DESC_DEVICE_QUALIFIER,
    .bcdUSB = 0x0200,
    .bDeviceClass = TUSB_CLASS_MISC,
    .bDeviceSubClass = MISC_SUBCLASS_COMMON,
    .bDeviceProtocol = MISC_PROTOCOL_IAD,
    .bMaxPacketSize0 = CFG_TUD_ENDPOINT0_SIZE,
    .bNumConfigurations = 1,
    .bReserved = 0,
};

const std::uint8_t kHighSpeedConfiguration[] = {
    TUD_CONFIG_DESCRIPTOR(1, kUsbInterfaceCount, 0, kUsbConfigurationLength,
                          TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP, 100),
    TUD_CDC_DESCRIPTOR(kUsbCdcInterface, kUsbCdcStringIndex, kUsbCdcNotificationEndpoint, 8,
                       kUsbCdcOutputEndpoint, kUsbCdcInputEndpoint, 512),
#if CFG_TUD_HID
    TUD_HID_DESCRIPTOR(kUsbGamepadInterface, kUsbGamepadStringIndex, HID_ITF_PROTOCOL_NONE,
                       sizeof(kGamepadReport), kUsbGamepadInputEndpoint, kUsbGamepadEndpointSize,
                       kUsbGamepadPollIntervalMs),
#endif
};

static_assert(sizeof(kHighSpeedConfiguration) == kUsbConfigurationLength,
              "The high-speed configuration descriptor must match its declared length");
#endif

constexpr char kUsbLanguageEnglish[] = {'\x09', '\x04'};

namespace {

constexpr std::size_t kMacBytes = 6;
constexpr std::size_t kSerialDigits = kMacBytes * 2;

char serial_number[kSerialDigits + 1] = CONFIG_TINYUSB_DESC_SERIAL_STRING;

}

void initialize_serial_number() {
  std::uint8_t mac[kMacBytes] = {};
  if (esp_read_mac(mac, ESP_MAC_BASE) != ESP_OK) {
    return;
  }
  (void)std::snprintf(serial_number, sizeof(serial_number), "%02X%02X%02X%02X%02X%02X", mac[0],
                      mac[1], mac[2], mac[3], mac[4], mac[5]);
}

const char* kStrings[] = {
    kUsbLanguageEnglish,
    CONFIG_TINYUSB_DESC_MANUFACTURER_STRING,
    CONFIG_TINYUSB_DESC_PRODUCT_STRING,
    serial_number,
    CONFIG_TINYUSB_DESC_CDC_STRING,
#if CFG_TUD_HID
    "Pitrig Gamepad",
#endif
};
const int kStringCount = static_cast<int>(sizeof(kStrings) / sizeof(kStrings[0]));

}
