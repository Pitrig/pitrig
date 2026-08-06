#pragma once

#include "sdkconfig.h"
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
#include "usb_cdc_transport.hpp"
#elif CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
#include "uart_transport.hpp"
#else
#include "uart_transport.hpp"
#include "usb_cdc_transport.hpp"
#endif

namespace simcore::board_registry {
struct BoardDefinition;
}

namespace simcore::configuration {
struct ApplicationConfiguration;
}

namespace simcore::transport {

// Owns the concrete transport adapters supported by the selected firmware
// board and exposes only the neutral transport interface to the core.
class TelemetryComposition final {
 public:
  [[nodiscard]] ITransport* select(
      const board_registry::BoardDefinition& board,
      const configuration::ApplicationConfiguration& configuration);

 private:
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
  UsbCdcTransport usb_cdc_;
#elif CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
  UartTransport uart_;
#else
  UsbCdcTransport usb_cdc_;
  UartTransport uart_;
#endif
};

}  // namespace simcore::transport
