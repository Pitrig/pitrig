#include "usb_gamepad.hpp"

#include "usb_descriptors.hpp"

#if CFG_TUD_HID
#include "class/hid/hid_device.h"
#endif

namespace simcore::transport::usb_gamepad {

#if CFG_TUD_HID
namespace {

constexpr std::uint8_t kInstance = 0;
constexpr std::uint8_t kReportId = 0;

}

bool available() { return true; }

bool ready() { return tud_hid_n_ready(kInstance); }

bool send(const Report& report) {
  if (!tud_hid_n_ready(kInstance)) {
    return false;
  }
  return tud_hid_n_gamepad_report(kInstance, kReportId, report.x, report.y,
                                  report.z, report.rz, report.rx, report.ry,
                                  report.hat, report.buttons);
}

#else

bool available() { return false; }

bool ready() { return false; }

bool send(const Report&) { return false; }

#endif

}

#if CFG_TUD_HID
extern "C" {

const std::uint8_t* tud_hid_descriptor_report_cb(const std::uint8_t instance) {
  (void)instance;
  return simcore::transport::usb_descriptors::kGamepadReport;
}

std::uint16_t tud_hid_get_report_cb(const std::uint8_t instance,
                                    const std::uint8_t report_id,
                                    const hid_report_type_t report_type,
                                    std::uint8_t* const buffer,
                                    const std::uint16_t length) {
  (void)instance;
  (void)report_id;
  (void)report_type;
  (void)buffer;
  (void)length;
  return 0;
}

void tud_hid_set_report_cb(const std::uint8_t instance,
                           const std::uint8_t report_id,
                           const hid_report_type_t report_type,
                           const std::uint8_t* const buffer,
                           const std::uint16_t length) {
  (void)instance;
  (void)report_id;
  (void)report_type;
  (void)buffer;
  (void)length;
}

}
#endif
