#pragma once

#include <cstdint>
#include <span>

namespace simcore::transport {

using DataHandler = void (*)(std::span<const std::uint8_t> data, void* context);

class ITransport {
 public:
  virtual ~ITransport() = default;

  virtual bool start(DataHandler handler, void* context) = 0;
  virtual void stop() = 0;
};

}  // namespace simcore::transport
