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

// A screen and a group are both containers for absolutely placed widgets, so
// neither may scroll, pad, or paint a border of its own.
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

// One transparent container per configured group, parented to its screen and
// sized to the group's box. LVGL then gives relative child coordinates and
// clipping for free, which is the whole reason a group is an object rather
// than arithmetic in the layout.
void create_groups(
    const configuration::ApplicationConfiguration& configuration,
    const std::span<lv_obj_t* const> screens,
    const std::span<lv_obj_t*> groups) {
  for (std::size_t screen_index = 0; screen_index < screens.size();
       ++screen_index) {
    if (screen_index >= configuration.dashboard.screen_count) {
      break;
    }
    lv_obj_t* const parent = screens[screen_index];
    const configuration::ScreenConfiguration& screen =
        configuration.dashboard.screens[screen_index];
    for (std::size_t index = 0; index < screen.group_count; ++index) {
      const configuration::GroupConfiguration& group = screen.groups[index];
      const std::size_t slot =
          screen_index * configuration::kMaximumGroups + index;
      if (parent == nullptr || slot >= groups.size()) {
        continue;
      }
      lv_obj_t* const container = lv_obj_create(parent);
      if (container == nullptr) {
        continue;
      }
      make_container(container);
      lv_obj_set_style_radius(container, 0, LV_PART_MAIN);
      // A group paints nothing of its own: it is a parent and a clip, and the
      // screen behind it shows through.
      lv_obj_set_style_bg_opa(container, LV_OPA_TRANSP, LV_PART_MAIN);
      lv_obj_set_pos(container, group.placement.x, group.placement.y);
      lv_obj_set_size(container, group.placement.width,
                      group.placement.height);
      groups[slot] = container;
    }
  }
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
// parent: a screen, whose children are its own widgets and its group
// containers, and then each of those groups over its own reference table. The
// scratch table is reused between parents, which is why more of them cost no
// more stack.
bool apply_parent_z_order(
    const std::span<const configuration::WidgetReference> references,
    const std::size_t reference_count,
    const std::span<const configuration::GroupConfiguration> groups,
    const std::size_t screen_index, Dashboard& dashboard) {
  std::array<WidgetLayer, configuration::kMaximumWidgetsPerScreen +
                              configuration::kMaximumGroups>
      layers{};
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
  // A group is one child of its screen, ordered among the screen's widgets by
  // its own z_index. Its children are ordered separately, within it.
  for (std::size_t index = 0; index < groups.size(); ++index) {
    lv_obj_t* const container =
        dashboard.groups[screen_index * configuration::kMaximumGroups + index];
    if (container != nullptr) {
      layers[count++] = {
          .object = container,
          .z_index = groups[index].z_index,
          .configuration_order =
              static_cast<std::uint8_t>(reference_count + index),
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
  dashboard.groups = {};
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
  create_groups(configuration, std::span{dashboard.screens}.first(count),
                dashboard.groups);
  lvgl_port_unlock();
  return count;
}

bool will_render_content(
    const configuration::ApplicationConfiguration& configuration) {
#if SIMCORE_DEBUG
  (void)configuration;
  return true;
#else
  // A screen whose widgets all sit inside groups has an empty reference table
  // of its own but is anything but empty; counting only screen.widget_count
  // would leave the splash covering a working dashboard.
  const configuration::ScreenConfiguration& screen =
      active_screen(configuration);
  if (screen.background_color != kDefaultBackgroundColor ||
      screen.widget_count > 0) {
    return true;
  }
  for (std::size_t index = 0; index < screen.group_count; ++index) {
    if (screen.groups[index].widget_count > 0) {
      return true;
    }
  }
  return false;
#endif
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
    if (!apply_parent_z_order(screen.widgets, screen.widget_count,
                              {screen.groups.data(), screen.group_count}, index,
                              dashboard)) {
      return false;
    }
    for (std::size_t group = 0; group < screen.group_count; ++group) {
      if (!apply_parent_z_order(screen.groups[group].widgets,
                                screen.groups[group].widget_count, {}, index,
                                dashboard)) {
        return false;
      }
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
  // knows no widget types; a group's container is a tap target in its own
  // right, which is what makes an empty group an invisible touch zone.
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
    for (std::size_t index = 0; index < screen.group_count; ++index) {
      const configuration::GroupConfiguration& group = screen.groups[index];
      bind_references(group.widgets, group.widget_count);
      bind(dashboard.groups[screen_index * configuration::kMaximumGroups +
                            index],
           group.action);
    }
  }
  lvgl_port_unlock();
  return bound;
}

void release(Dashboard& dashboard) {
  // Group containers die with the screens that own them, except on screen
  // zero, which the display keeps.
  for (lv_obj_t*& group : dashboard.groups) {
    if (group != nullptr && dashboard.screens[0] != nullptr &&
        lv_obj_get_screen(group) == dashboard.screens[0]) {
      lv_obj_delete(group);
    }
    group = nullptr;
  }
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
