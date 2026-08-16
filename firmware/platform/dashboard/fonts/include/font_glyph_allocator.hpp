#pragma once

namespace simcore::dashboard::fonts {

// Points LVGL's font draw buffers at external RAM. Rasterized glyphs are the
// largest recurring allocation a dashboard makes, and the IDF allocator keeps
// blocks below its internal-memory threshold in internal RAM, which a display
// of this size cannot spare. Only the font handlers are replaced; display and
// image buffers keep their defaults.
//
// Call once, after LVGL is initialized and before the first font is created;
// repeat calls are ignored.
void install_external_memory_glyph_allocator();

}  // namespace simcore::dashboard::fonts
