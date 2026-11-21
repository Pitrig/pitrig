#pragma once

#include <variant>

#include "pitrig_features.hpp"
#include "transport.hpp"
#include "usb_cdc_transport.hpp"
#include "usb_serial_jtag_transport.hpp"

namespace pitrig::transport {

class UsbFallbackTransport final : public ITransport {
 public:
  bool start(DataHandler handler, void* context) override;
  void stop() override;
  bool write(std::span<const std::uint8_t> data) override;
#if PITRIG_DEBUG
  [[nodiscard]] Diagnostics diagnostics() const override;
#endif

  void silence_logs();

 private:
  [[nodiscard]] ITransport* active();

  std::variant<std::monostate, UsbCdcTransport, UsbSerialJtagTransport> port_;
};

}
