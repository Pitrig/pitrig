#include "external_memory_buffer.hpp"

#include "esp_heap_caps.h"

namespace simcore::platform {

ExternalMemoryBuffer::~ExternalMemoryBuffer() {
  if (data_ != nullptr) {
    heap_caps_free(data_);
  }
}

bool ExternalMemoryBuffer::initialize(const std::size_t size) {
  if (data_ != nullptr || size == 0) {
    return false;
  }
  data_ = static_cast<std::uint8_t*>(
      heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (data_ == nullptr) {
    return false;
  }
  size_ = size;
  return true;
}

}  // namespace simcore::platform
