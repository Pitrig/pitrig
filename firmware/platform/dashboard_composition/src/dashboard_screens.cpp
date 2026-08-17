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

namespace simcore::dashboard_composition::screens {
namespace {

constexpr std::uint32_t kDefaultBackgroundColor = 0x000000;

// A screen holds absolutely placed widgets, so it may not scroll, pad, or paint
// a border of its own.
void make_container(lv_obj_t* const object) {
  lv_obj_remove_flag(object, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_pad_all(object, 0, LV_PART_MAIN);
  lv_obj_set_style_border_width(object, 0, LV_PART_MAIN);
}

// The screens a configuration asks for, in configuration order. An empty
// dashboard still gets one, so a bare document renders a background.
std::size_t create_screens(
    lv_display_t* const display,
    const configuration::ApplicationConfiguration& configuration,
    const std::span<lv_obj_t*> screens) {
  const std::size_t count =
      std::max<std::size_t>(configuration.dashboard.screen_count, 1);
  std::size_t created{};
  for (std::size_t index = 0; index < count && index < screens.size();
       ++index) {
    lv_obj_t* const screen = screen_object(display, index);
    if (screen == nullptr) {
      break;
    }
    screens[index] = screen;
    ++created;
  }
  return created;
}

const configuration::ScreenConfiguration& active_screen(
    const configuration::ApplicationConfiguration& configuration) {
  static const configuration::ScreenConfiguration kEmptyScreen{};
  return configuration.dashboard.screen_count > 0
             ? configuration.dashboard.screens[0]
             : kEmptyScreen;
}

std::uint32_t screen_background(
    const configuration::ApplicationConfiguration& configuration,
    const std::size_t index) {
  return index < configuration.dashboard.screen_count
             ? configuration.dashboard.screens[index].background_color
             : kDefaultBackgroundColor;
}

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
// what it is told, so this coexists with LVGL's own handler rather than
// replacing it. The measurement is static after composition; the pointer is into
// the dashboard's own array, which outlives the object it is attached to.
void report_container_overflow(lv_event_t* const event) {
  const auto* const overflow =
      static_cast<const std::int32_t*>(lv_event_get_user_data(event));
  if (overflow != nullptr) {
    lv_event_set_ext_draw_size(event, *overflow);
  }
}

// How far one child reaches beyond its own box. Only a container does, and only
// by the amount this pass already measured for it, so the answer is a lookup in
// the table rather than a second measurement.
[[nodiscard]] std::int32_t child_overflow(const Dashboard& dashboard,
                                          const lv_obj_t* const object) {
  for (std::size_t index = 0; index < dashboard.containers.size(); ++index) {
    if (dashboard.containers[index] == object) {
      return dashboard.container_overflow[index];
    }
  }
  return 0;
}

// The screen an action names, resolved once here so a tap performs no lookup.
// A name that matches nothing was already refused by validation; falling back
// to the current screen keeps a hand-built document from navigating somewhere
// arbitrary.
std::uint8_t resolve_action_target(
    const configuration::ApplicationConfiguration& configuration,
    const configuration::WidgetAction& action) {
  const std::string_view target = configuration::text_view(action.screen);
  for (std::size_t index = 0; index < configuration.dashboard.screen_count;
       ++index) {
    if (configuration::text_view(configuration.dashboard.screens[index].id) ==
        target) {
      return static_cast<std::uint8_t>(index);
    }
  }
  return 0;
}

}  // namespace

lv_obj_t* screen_object(lv_display_t* const display, const std::size_t index) {
  if (index == 0) {
    return lv_display_get_screen_active(display);
  }
  lv_obj_t* const screen = lv_obj_create(nullptr);
  if (screen == nullptr) {
    return nullptr;
  }
  make_container(screen);
  return screen;
}

std::size_t create(lv_display_t* const display,
                   const configuration::ApplicationConfiguration& configuration,
                   Dashboard& dashboard) {
  dashboard.screens = {};
  dashboard.containers = {};
  dashboard.container_overflow = {};
  if (!lvgl_port_lock(0)) {
    log::error("dashboard", "Failed to lock LVGL for dashboard screens");
    return 0;
  }
  const std::size_t count =
      create_screens(display, configuration, dashboard.screens);
  for (std::size_t index = 0; index < count; ++index) {
    lv_obj_t* const screen = dashboard.screens[index];
    lv_obj_set_style_bg_color(
        screen, lv_color_hex(screen_background(configuration, index)),
        LV_PART_MAIN);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);
  }
  lvgl_port_unlock();
  return count;
}

bool will_render_content(
    const configuration::ApplicationConfiguration& configuration) {
#if SIMCORE_DEBUG
  (void)configuration;
  return true;
#else
  // A container is a widget in its screen's own reference table, so a screen
  // holding nothing but one full container still counts as non-empty here.
  const configuration::ScreenConfiguration& screen =
      active_screen(configuration);
  return screen.background_color != kDefaultBackgroundColor ||
         screen.widget_count > 0;
#endif
}

bool unclip_containers(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard) {
  const configuration::DashboardConfiguration& document = configuration.dashboard;
  if (!lvgl_port_lock(0)) {
    return false;
  }
  // Reverse pool order, so a nested container's own extra draw size is already
  // final when the container above it folds that in. The pool is ordered
  // parent-before-child, which is what makes one pass exact at any depth.
  for (std::size_t index = document.shape_widget_count; index > 0; --index) {
    const std::size_t slot = index - 1;
    lv_obj_t* const container = dashboard.containers[slot];
    if (container == nullptr || document.shape_widgets[slot].widget_count == 0) {
      continue;
    }
    lv_area_t box{};
    lv_obj_get_coords(container, &box);
    std::int32_t overflow = 0;
    // LVGL children rather than the reference table: a caption and its border
    // mask are parented to the container and appear in no table, and a clipped
    // caption is the whole reason this pass exists.
    const std::uint32_t children = lv_obj_get_child_count(container);
    for (std::uint32_t child = 0; child < children; ++child) {
      lv_obj_t* const object = lv_obj_get_child(container, child);
      if (object == nullptr) {
        continue;
      }
      lv_area_t reach{};
      lv_obj_get_coords(object, &reach);
      // What this child in turn lets through. Read from what this pass already
      // measured rather than from LVGL, whose accessor is private — and this
      // walks the pool backwards precisely so a nested container's own figure
      // is final by the time its parent folds it in. Anything else contributes
      // nothing: no widget here draws a shadow or an outline outside its box.
      const std::int32_t own = child_overflow(dashboard, object);
      overflow = std::max({overflow, box.x1 - (reach.x1 - own),
                           (reach.x2 + own) - box.x2, box.y1 - (reach.y1 - own),
                           (reach.y2 + own) - box.y2});
    }
    dashboard.container_overflow[slot] = std::max<std::int32_t>(overflow, 0);
    lv_obj_add_flag(container, LV_OBJ_FLAG_OVERFLOW_VISIBLE);
    lv_obj_add_event_cb(container, report_container_overflow,
                        LV_EVENT_REFR_EXT_DRAW_SIZE,
                        &dashboard.container_overflow[slot]);
    lv_obj_refresh_ext_draw_size(container);
  }
  lvgl_port_unlock();
  return true;
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
  return true;
}

bool bind_actions(const configuration::ApplicationConfiguration& configuration,
                  Dashboard& dashboard) {
  if (!lvgl_port_lock(0)) {
    return false;
  }
  bool bound = true;
  const auto bind = [&](lv_obj_t* const object,
                        const configuration::WidgetAction& action) {
    if (action.type == configuration::WidgetActionType::none) {
      return;
    }
    if (!dashboard.navigation.add_action(
            object, action.type,
            resolve_action_target(configuration, action))) {
      bound = false;
    }
  };
  // Widget roots come through the same accessor the z-order pass uses, so this
  // knows no widget types. A container shape is a widget like any other, so an
  // empty one with an action is an invisible touch zone and needs no case of
  // its own.
  const auto bind_references =
      [&](const std::span<const configuration::WidgetReference> references,
          const std::size_t count) {
        for (std::size_t index = 0; index < count; ++index) {
          const configuration::WidgetReference& reference = references[index];
          const configuration::WidgetFrame* const frame =
              configuration::widget_traits(reference.type)
                  .frame(configuration.dashboard, reference.index);
          if (frame != nullptr) {
            bind(dashboard.widgets.root_object(reference.type, reference.index),
                 frame->action);
          }
        }
      };

  for (std::size_t screen_index = 0;
       screen_index < configuration.dashboard.screen_count; ++screen_index) {
    const configuration::ScreenConfiguration& screen =
        configuration.dashboard.screens[screen_index];
    bind_references(screen.widgets, screen.widget_count);
  }
  // Then every container's own table, flat over the pool: validation guarantees
  // each widget is referenced by exactly one parent, so nothing is bound twice.
  for (std::size_t index = 0;
       index < configuration.dashboard.shape_widget_count; ++index) {
    const configuration::ShapeWidgetConfiguration& shape =
        configuration.dashboard.shape_widgets[index];
    bind_references(shape.widgets, shape.widget_count);
  }
  lvgl_port_unlock();
  return bound;
}

void release(Dashboard& dashboard) {
  // Containers are widgets now, so the shape collection owns and deletes them.
  // What is left here is the view of them, and the overflow the ext-draw-size
  // event reads back — a stale entry would outlive the object it describes.
  dashboard.containers = {};
  dashboard.container_overflow = {};
  // Index zero belongs to the display and outlives every dashboard; the rest
  // were created by screen_object() and are deleted here. LVGL refuses to
  // delete the screen that is loaded, so the display's own screen is loaded
  // back first — which is also where the next create() starts.
  if (dashboard.screens[0] != nullptr) {
    lv_screen_load(dashboard.screens[0]);
  }
  for (std::size_t index = 1; index < dashboard.screens.size(); ++index) {
    if (dashboard.screens[index] != nullptr) {
      lv_obj_delete(dashboard.screens[index]);
      dashboard.screens[index] = nullptr;
    }
  }
}

}  // namespace simcore::dashboard_composition::screens
