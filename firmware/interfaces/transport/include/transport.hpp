#pragma once

#include <cstdint>
#include <span>

#include "pitrig_features.hpp"

namespace pitrig::transport {

using DataHandler = void (*)(std::span<const std::uint8_t> data, void* context);

#if PITRIG_DEBUG
struct Diagnostics {
  std::uint64_t received_bytes{};
  std::uint64_t read_events{};
  std::uint32_t fifo_overflows{};
  std::uint32_t buffer_full_events{};
  std::uint32_t buffered_bytes{};
  std::uint32_t maximum_read_gap_ms{};
  std::uint32_t maximum_handler_time_us{};
};
#endif

class ITransport {
 public:
  virtual ~ITransport() = default;

  virtual bool start(DataHandler handler, void* context) = 0;
  virtual void stop() = 0;
  [[nodiscard]] virtual bool write(std::span<const std::uint8_t> data) = 0;
#if PITRIG_DEBUG
  [[nodiscard]] virtual Diagnostics diagnostics() const { return {}; }
#endif
};

}
