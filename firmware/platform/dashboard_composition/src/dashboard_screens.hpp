#pragma once

#include <cstddef>

#include "dashboard_composition.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;
struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace pitrig::configuration {
struct ApplicationConfiguration;
}

namespace pitrig::dashboard_composition::screens {

[[nodiscard]] lv_obj_t* screen_object(lv_display_t* display, std::size_t index);

[[nodiscard]] std::size_t create(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard);

[[nodiscard]] bool will_render_content(
    const configuration::ApplicationConfiguration& configuration);

[[nodiscard]] bool apply_container_clipping(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard);

[[nodiscard]] bool apply_z_order(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard);

[[nodiscard]] bool bind_actions(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard);

[[nodiscard]] std::size_t extend(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard, std::size_t from);

[[nodiscard]] bool attach_slots(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard);

void release(Dashboard& dashboard);

}
