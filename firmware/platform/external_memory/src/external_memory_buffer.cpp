#include "external_memory_buffer.hpp"

#include "esp_heap_caps.h"

namespace pitrig::platform {

ExternalMemoryBuffer::~ExternalMemoryBuffer() {
  if (data_ != nullptr) {
    heap_caps_free(data_);
  }
}

bool ExternalMemoryBuffer::ensure(const std::size_t size) {
  if (size == 0) {
    return true;
  }
  if (size <= size_) {
    return true;
  }
  if (data_ != nullptr) {
    heap_caps_free(data_);
    data_ = nullptr;
    size_ = 0;
  }
  return initialize(size);
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

}
