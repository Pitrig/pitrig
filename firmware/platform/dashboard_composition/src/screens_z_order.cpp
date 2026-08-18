#include "dashboard_screens.hpp"

#include <algorithm>
#include <array>
#include <cstdint>
#include <span>
#include <string_view>

#include "application_configuration.hpp"
#include "logger.hpp"
#include "simcore_features.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "dashboard_screens.hpp"

// Ordering one parent's children. The firmware sorts within an LVGL parent by
// z_index with authored array order breaking ties, and every parent — a
// screen, a container shape, a slot page — orders its own table.
namespace simcore::dashboard_composition::screens {
namespace {

struct WidgetLayer {
  lv_obj_t* object{};
  std::int16_t z_index{};
  std::uint8_t configuration_order{};
};

// Stacking is an order among one LVGL parent's children, so this runs once per
// parent — a screen, or a container shape — over that parent's own reference
// table. A container is one child of its own parent, ordered there by its own
// z_index, and orders its children separately within itself; that is why depth
// costs nothing here. The scratch table is reused between parents, which is why
// more of them cost no more stack.
bool apply_parent_z_order(
    const std::span<const configuration::WidgetReference> references,
    const std::size_t reference_count, Dashboard& dashboard) {
  std::array<WidgetLayer, configuration::kMaximumWidgetsPerScreen> layers{};
  std::size_t count{};
  // Authored order breaks z_index ties, and the reference table is that order.
  for (std::size_t index = 0; index < reference_count; ++index) {
    const configuration::WidgetReference& reference = references[index];
    lv_obj_t* const object =
        dashboard.widgets.root_object(reference.type, reference.index);
    if (object != nullptr) {
      layers[count++] = {
          .object = object,
          .z_index = reference.z_index,
          .configuration_order = static_cast<std::uint8_t>(index),
      };
    }
  }

  for (std::size_t index = 1; index < count; ++index) {
    const WidgetLayer layer = layers[index];
    std::size_t insertion = index;
    while (insertion > 0 &&
           (layer.z_index < layers[insertion - 1].z_index ||
            (layer.z_index == layers[insertion - 1].z_index &&
             layer.configuration_order <
                 layers[insertion - 1].configuration_order))) {
      layers[insertion] = layers[insertion - 1];
      --insertion;
    }
    layers[insertion] = layer;
  }

  if (!lvgl_port_lock(0)) {
    return false;
  }
  for (std::size_t index = 0; index < count; ++index) {
    lv_obj_move_to_index(layers[index].object, static_cast<std::int32_t>(index));
  }
  lvgl_port_unlock();
  return true;
}

// How far this container's children reach past it, reported to LVGL whenever it
// recomputes the extra draw size. lv_event_set_ext_draw_size keeps the larger of

}  // namespace

bool apply_z_order(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard) {
  const configuration::DashboardConfiguration& dashboard_configuration =
      configuration.dashboard;
  for (std::size_t index = 0; index < dashboard_configuration.screen_count;
       ++index) {
    const configuration::ScreenConfiguration& screen =
        dashboard_configuration.screens[index];
    if (!apply_parent_z_order(screen.widgets, screen.widget_count, dashboard)) {
      return false;
    }
  }
  // Then every container, flat over the pool. Each is one parent's ordering,
  // and a container's own place among its siblings was settled above.
  for (std::size_t index = 0;
       index < dashboard_configuration.shape_widget_count; ++index) {
    const configuration::ShapeWidgetConfiguration& shape =
        dashboard_configuration.shape_widgets[index];
    if (shape.widget_count > 0 &&
        !apply_parent_z_order(shape.widgets, shape.widget_count, dashboard)) {
      return false;
    }
  }
  // A slot page is a parent like any other. The pages themselves need no order
  // among each other: exactly one is ever visible.
  for (std::size_t index = 0;
       index < dashboard_configuration.slot_widget_count; ++index) {
    const configuration::SlotWidgetConfiguration& widget =
        dashboard_configuration.slot_widgets[index];
    for (std::size_t page = 0; page < widget.page_count; ++page) {
      const configuration::SlotPageConfiguration& config = widget.pages[page];
      if (config.widget_count > 0 &&
          !apply_parent_z_order(config.widgets, config.widget_count,
                                dashboard)) {
        return false;
      }
    }
  }
  return true;
}

}  // namespace simcore::dashboard_composition::screens
