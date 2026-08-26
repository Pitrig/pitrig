#pragma once

#include "sdkconfig.h"
#include "simcore_features.hpp"

#include <cstddef>
#include <span>
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
#include "usb_cdc_transport.hpp"
#if SIMCORE_SECOND_TELEMETRY_LINK
#include "usb_serial_jtag_transport.hpp"
#endif
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

class TelemetryComposition final {
 public:
  [[nodiscard]] std::size_t select(
      const board_registry::BoardDefinition& board,
      const configuration::ApplicationConfiguration& configuration,
      std::span<ITransport*> links);

  void silence_logs();

 private:
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
  UsbCdcTransport usb_cdc_;
#if SIMCORE_SECOND_TELEMETRY_LINK
  UsbSerialJtagTransport usb_serial_jtag_;
#endif
#elif CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
  UartTransport uart_;
#else
  UsbCdcTransport usb_cdc_;
  UartTransport uart_;
#endif
};

}
