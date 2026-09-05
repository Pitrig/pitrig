#include "dashboard_screens.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_state.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace pitrig::dashboard_composition::screens {
namespace {

struct WidgetLayer {
  configuration::WidgetType type{};
  std::uint8_t index{};
  std::int16_t z_index{};
  std::uint8_t configuration_order{};
};

bool apply_parent_z_order(
    const std::span<const configuration::WidgetReference> references,
    const std::size_t reference_count, Dashboard& dashboard) {
  std::array<WidgetLayer, configuration::kMaximumWidgetsPerScreen> layers{};
  std::size_t count{};
  for (std::size_t index = 0; index < reference_count; ++index) {
    const configuration::WidgetReference& reference = references[index];
    if (dashboard.widgets.root_object(reference.type, reference.index) !=
        nullptr) {
      layers[count++] = {
          .type = reference.type,
          .index = reference.index,
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
  std::int32_t position = 0;
  for (std::size_t index = 0; index < count; ++index) {
    const WidgetLayer& layer = layers[index];
    lv_obj_t* const object =
        dashboard.widgets.root_object(layer.type, layer.index);
    if (object == nullptr) {
      continue;
    }
    lv_obj_move_to_index(object, position++);
    lv_obj_t* const caption =
        dashboard.widgets.caption_object(layer.type, layer.index);
    if (caption != nullptr) {
      lv_obj_move_to_index(caption, position++);
    }
  }
  lvgl_port_unlock();
  return true;
}

}

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
  for (std::size_t index = 0;
       index < dashboard_configuration.shape_widget_count; ++index) {
    const configuration::ShapeWidgetConfiguration& shape =
        dashboard_configuration.shape_widgets[index];
    if (shape.widget_count > 0 &&
        !apply_parent_z_order(shape.widgets, shape.widget_count, dashboard)) {
      return false;
    }
  }
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

}
