#pragma once

#include <atomic>
#include <cstdint>

namespace pitrig::telemetry {

template <typename Copy>
[[nodiscard]] auto seqlock_read(const std::atomic<std::uint32_t>& sequence, Copy copy)
    -> decltype(copy()) {
  for (;;) {
    const std::uint32_t before = sequence.load(std::memory_order_acquire);
    if ((before & 1U) != 0U) {
      continue;
    }
    decltype(copy()) value = copy();
    std::atomic_thread_fence(std::memory_order_acquire);
    if (sequence.load(std::memory_order_relaxed) == before) {
      return value;
    }
  }
}

}
