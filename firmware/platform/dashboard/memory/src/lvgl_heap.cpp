#include <cstddef>
#include <cstdint>
#include <cstring>

#include "esp_heap_caps.h"
#include "lvgl.h"
#include "sdkconfig.h"

#if CONFIG_LV_USE_CUSTOM_MALLOC

namespace {

constexpr std::uint32_t kExternal = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
constexpr std::uint32_t kAnywhere = MALLOC_CAP_8BIT;

}

void lv_mem_init() {}

void lv_mem_deinit() {}

lv_mem_pool_t lv_mem_add_pool(void* const memory, const std::size_t bytes) {
  (void)memory;
  (void)bytes;
  return nullptr;
}

void lv_mem_remove_pool(lv_mem_pool_t pool) { (void)pool; }

void* lv_malloc_core(const std::size_t size) {
  void* const external = heap_caps_malloc(size, kExternal);
  return external != nullptr ? external : heap_caps_malloc(size, kAnywhere);
}

void* lv_realloc_core(void* const pointer, const std::size_t size) {
  void* const external = heap_caps_realloc(pointer, size, kExternal);
  return external != nullptr ? external
                             : heap_caps_realloc(pointer, size, kAnywhere);
}

void lv_free_core(void* const pointer) { heap_caps_free(pointer); }

void lv_mem_monitor_core(lv_mem_monitor_t* const monitor) {
  std::memset(monitor, 0, sizeof(*monitor));
}

lv_result_t lv_mem_test_core() { return LV_RESULT_OK; }

#endif
