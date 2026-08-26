#include <cstddef>
#include <cstdint>
#include <cstring>

#include "esp_heap_caps.h"
#include "lvgl.h"
#include "sdkconfig.h"

// Every allocation LVGL makes — each object and its styles, the caches a
// rasterized font keeps, the text a label copies — is taken from external RAM
// instead of the internal heap.
//
// It is a decision about what bounds a dashboard rather than a micro
// optimization. The IDF allocator hands out internal memory first, so a
// dashboard's cost was paid in the scarcest memory on the board: on the
// T-Display-S3 every distinct font size cost 5.4 KB of internal RAM and the
// twenty-third exhausted it, after which glyph caching quietly stopped
// working while the configuration was still accepted. With the heap here,
// internal free memory no longer moves with what is composed at all, and the
// same dashboards draw in the same time — measured on all three boards.
//
// Nothing a driver hands to DMA passes through this: esp_lvgl_port allocates
// the display draw buffers itself with explicit capabilities, and the font
// draw buffers go through install_external_memory_glyph_allocator().
#if CONFIG_LV_USE_CUSTOM_MALLOC

namespace {

constexpr std::uint32_t kExternal = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
constexpr std::uint32_t kAnywhere = MALLOC_CAP_8BIT;

}  // namespace

// LVGL declares these with C linkage in lv_mem.h, which these definitions
// adopt by matching it.

void lv_mem_init() {}

void lv_mem_deinit() {}

// A pool is how LVGL is handed a second arena to allocate from. This allocator
// owns no arena — it forwards to the heap — so there is nothing to add to.
lv_mem_pool_t lv_mem_add_pool(void* const memory, const std::size_t bytes) {
  (void)memory;
  (void)bytes;
  return nullptr;
}

void lv_mem_remove_pool(lv_mem_pool_t pool) { (void)pool; }

void* lv_malloc_core(const std::size_t size) {
  void* const external = heap_caps_malloc(size, kExternal);
  // A board whose external RAM is absent or exhausted keeps running on the
  // internal heap, the same fallback the glyph allocator makes.
  return external != nullptr ? external : heap_caps_malloc(size, kAnywhere);
}

void* lv_realloc_core(void* const pointer, const std::size_t size) {
  void* const external = heap_caps_realloc(pointer, size, kExternal);
  return external != nullptr ? external
                             : heap_caps_realloc(pointer, size, kAnywhere);
}

void lv_free_core(void* const pointer) { heap_caps_free(pointer); }

// Read only by LVGL's own memory overlay, which this firmware does not build
// (LV_USE_SYSMON is off). The heap figures a host needs come from `@SC:DIAG`,
// which reports both heaps rather than LVGL's view of one of them.
void lv_mem_monitor_core(lv_mem_monitor_t* const monitor) {
  std::memset(monitor, 0, sizeof(*monitor));
}

lv_result_t lv_mem_test_core() { return LV_RESULT_OK; }

#endif  // CONFIG_LV_USE_CUSTOM_MALLOC
