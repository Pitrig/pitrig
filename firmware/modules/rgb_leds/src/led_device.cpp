#include "led_device.hpp"

namespace pitrig::rgb_leds {
namespace {

[[nodiscard]] led::Order order_of(const configuration::MatrixOrder order) {
  return order == configuration::MatrixOrder::progressive ? led::Order::progressive
                                                          : led::Order::serpentine;
}

[[nodiscard]] led::Origin origin_of(const configuration::MatrixOrigin origin) {
  switch (origin) {
    case configuration::MatrixOrigin::top_right:
      return led::Origin::top_right;
    case configuration::MatrixOrigin::bottom_left:
      return led::Origin::bottom_left;
    case configuration::MatrixOrigin::bottom_right:
      return led::Origin::bottom_right;
    default:
      return led::Origin::top_left;
  }
}

}

led::driver::Chip chip_of(const configuration::LedChip chip) {
  return chip == configuration::LedChip::sk6812_rgbw ? led::driver::Chip::sk6812_rgbw
                                                     : led::driver::Chip::ws2812b;
}

led::Matrix geometry_of(const configuration::HardwareDeviceConfiguration& device) {
  if (device.type == configuration::HardwareDeviceType::rgb_strip) {
    return {.width = device.count,
            .height = 1,
            .order = led::Order::progressive,
            .origin = led::Origin::top_left,
            .rotation_deg = 0};
  }
  return {.width = device.width,
          .height = device.height,
          .order = order_of(device.order),
          .origin = origin_of(device.origin),
          .rotation_deg = device.rotation_deg};
}

std::size_t lamps_of(const configuration::HardwareDeviceConfiguration& device) {
  return device.type == configuration::HardwareDeviceType::rgb_strip
             ? device.count
             : static_cast<std::size_t>(device.width) * device.height;
}

}
