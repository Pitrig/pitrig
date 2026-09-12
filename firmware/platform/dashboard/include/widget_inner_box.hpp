#pragma once

#include <algorithm>
#include <cstdint>

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"

namespace pitrig::dashboard {

struct InnerBox {
  std::int32_t width{};
  std::int32_t height{};
};

[[nodiscard]] inline InnerBox inner_box(const configuration::WidgetFrame& frame, const Rect& bounds,
                                        const std::int32_t inset = 0) {
  const std::int32_t border = frame.border.width_px;
  return InnerBox{
      std::max<std::int32_t>(
          bounds.width - 2 * border - frame.padding.left - frame.padding.right - 2 * inset, 0),
      std::max<std::int32_t>(
          bounds.height - 2 * border - frame.padding.top - frame.padding.bottom - 2 * inset, 0)};
}

}
