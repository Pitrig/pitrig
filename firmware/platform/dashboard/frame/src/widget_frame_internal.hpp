#pragma once

#include <cstdint>

#include "widget_frame.hpp"

namespace simcore::dashboard::frame::internal {

[[nodiscard]] bool resolve_frame_box(const Layout& layout, const Config& config,
                                     const char* tag,
                                     std::int32_t content_width,
                                     std::int32_t content_height,
                                     bool fill_available_width,
                                     const fonts::Registry& fonts,
                                     lv_obj_t*& parent, Rect& bounds,
                                     std::int32_t& caption_height);

void build_caption(const Config& config, const fonts::Registry& fonts,
                   lv_obj_t* parent, const Rect& bounds, Box& box);

[[nodiscard]] std::int32_t caption_width(const lv_font_t* font,
                                         const char* text);

[[nodiscard]] Rect caption_position(const CaptionLayout& layout,
                                    std::int32_t width);

[[nodiscard]] CaptionMask caption_mask_for(const CaptionLayout& layout,
                                           std::int32_t width,
                                           std::uint32_t rgb);

}
