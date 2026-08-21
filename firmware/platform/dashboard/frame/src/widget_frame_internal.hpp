#pragma once

#include <cstdint>

#include "widget_frame.hpp"

// Shared between the frame's two translation units: frame_geometry.cpp resolves
// where a frame lands and builds the caption that overhangs it, widget_frame.cpp
// styles the objects and runs the build/update lifecycle. Both halves meet at
// exactly these two calls.
namespace simcore::dashboard::frame::internal {

// Where a frame lands and how much room its caption takes. Shared by build and
// update so an in-place restyle cannot resolve a widget to a different box than
// the composition that first placed it would have.
[[nodiscard]] bool resolve_frame_box(const Layout& layout, const Config& config,
                                     const char* tag,
                                     std::int32_t content_width,
                                     std::int32_t content_height,
                                     bool fill_available_width,
                                     const fonts::Registry& fonts,
                                     lv_obj_t*& parent, Rect& bounds,
                                     std::int32_t& caption_height);

// Creates the caption, plus the mask that hides the border line behind it.
// Both sit on the parent so the border can pass behind.
void build_caption(const Config& config, const fonts::Registry& fonts,
                   lv_obj_t* parent, const Rect& bounds, Box& box);

}  // namespace simcore::dashboard::frame::internal
