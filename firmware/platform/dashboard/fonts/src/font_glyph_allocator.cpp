#include "font_glyph_allocator.hpp"

#include <cstddef>

#include "esp_heap_caps.h"
#include "lvgl.h"
#include "lvgl_private.h"

namespace simcore::dashboard::fonts {
namespace {

bool installed;

void* allocate_glyph_buffer(const std::size_t size,
                            const lv_color_format_t color_format) {
  (void)color_format;
  const std::size_t padded = size + LV_DRAW_BUF_ALIGN - 1;
  void* const external =
      heap_caps_malloc(padded, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  return external != nullptr ? external : lv_malloc(padded);
}

void free_glyph_buffer(void* const buffer) {
  heap_caps_free(buffer);
}

}

void install_external_memory_glyph_allocator() {
  if (installed) {
    return;
  }
  lv_draw_buf_handlers_t* const handlers = lv_draw_buf_get_font_handlers();
  if (handlers == nullptr) {
    return;
  }
  handlers->buf_malloc_cb = allocate_glyph_buffer;
  handlers->buf_free_cb = free_glyph_buffer;
  installed = true;
}

}
