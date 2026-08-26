#include "dashboard_composition.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_assets.hpp"
#include "dashboard_screens.hpp"
#include "dashboard_state.hpp"
#include "dashboard_storages.hpp"
#include "esp_lvgl_port.h"
#include "logger.hpp"
#include "lvgl.h"
#include "widget_frame.hpp"

#include "dashboard_incremental_rules.hpp"
namespace simcore::dashboard_composition {
namespace {

constexpr char kTag[] = "dashboard";

using incremental::is_container;
using incremental::needs_update;
using incremental::repainted_containers;

[[nodiscard]] bool decline(const char* const reason) {
  log::info(kTag, "Incremental apply declined: %s", reason);
  return false;
}

[[nodiscard]] bool add_screens(
    const configuration::DashboardConfiguration& before,
    const configuration::ApplicationConfiguration& next, Dashboard& dashboard) {
  lv_display_t* const display = dashboard.slot.layout.display;
  if (display == nullptr || !lvgl_port_lock(0)) {
    return false;
  }
  const std::size_t count =
      screens::extend(display, next, dashboard, before.screen_count);
  const bool added = count >= next.dashboard.screen_count;
  if (added) {
    const std::span<lv_obj_t* const> screens =
        std::span{dashboard.screens}.first(count);
    for (WidgetStorage* const storage : storages(dashboard)) {
      storage->layout.screens = screens;
    }
    dashboard.navigation.attach(screens);
  }
  lvgl_port_unlock();
  return added;
}

[[nodiscard]] bool recolour_screens(
    const configuration::DashboardConfiguration& before,
    const configuration::DashboardConfiguration& after, Dashboard& dashboard,
    std::uint32_t& recoloured) {
  static_assert(configuration::kMaximumScreens <= 32,
                "The recoloured-screen set is one bit per screen");
  recoloured = 0;
  for (std::size_t index = 0; index < after.screen_count; ++index) {
    if (before.screens[index].background_color ==
        after.screens[index].background_color) {
      continue;
    }
    if (!lvgl_port_lock(0)) {
      return false;
    }
    lv_obj_set_style_bg_color(
        dashboard.screens[index],
        lv_color_hex(after.screens[index].background_color), LV_PART_MAIN);
    lvgl_port_unlock();
    recoloured |= 1U << index;
  }
  return true;
}

}

bool apply_incremental(
    const configuration::ApplicationConfiguration& previous,
    const configuration::ApplicationConfiguration& next, Dashboard& dashboard) {
  const configuration::DashboardConfiguration& before = previous.dashboard;
  const configuration::DashboardConfiguration& after = next.dashboard;

  if (after.screen_count < before.screen_count) {
    return decline("screen removed");
  }
  if (after.screen_count > before.screen_count &&
      !add_screens(before, next, dashboard)) {
    return decline("screen could not be added");
  }

  if (!assets::acquire_fonts(next, dashboard.fonts)) {
    return decline("font registry cannot hold both documents");
  }

  const bool had_slots = before.slot_widget_count != 0;
  if (!lvgl_port_lock(0)) {
    return decline("LVGL is busy");
  }
  dashboard.navigation.clear_actions();
  dashboard.navigation.set_transition(after.transition);
  if (had_slots) {
    dashboard.slots.clear();
  }
  lvgl_port_unlock();

  for (WidgetStorage* const storage : storages(dashboard)) {
    storage->dashboard = &after;
  }

  std::uint32_t recoloured_screens = 0;
  if (!recolour_screens(before, after, dashboard, recoloured_screens)) {
    return decline("LVGL is busy");
  }
  const incremental::ContainerSet repainted = repainted_containers(before, after);

  const bool slots_touched = had_slots || after.slot_widget_count != 0;

  for (std::size_t entry = 0; entry < dashboard.widgets.type_count(); ++entry) {
    const configuration::WidgetType type = dashboard.widgets.type_at(entry);
    const configuration::WidgetTypeTraits& traits =
        configuration::widget_traits(type);
    const std::uint8_t previous_count = traits.count(before);
    const std::uint8_t count = traits.count(after);
    if (!(is_container(type) && count < previous_count) &&
        !dashboard.widgets.sync_count(type, count)) {
      return decline("widget pool cannot be resized");
    }
    for (std::uint8_t index = 0; index < count; ++index) {
      if (!needs_update(traits, before, after, index, previous_count,
                        recoloured_screens, repainted)) {
        continue;
      }
      if (!dashboard.widgets.update_instance(type, index)) {
        return decline("a widget could not be updated in place");
      }
    }
  }
  for (std::size_t entry = dashboard.widgets.type_count(); entry > 0; --entry) {
    const configuration::WidgetType type = dashboard.widgets.type_at(entry - 1);
    const configuration::WidgetTypeTraits& traits =
        configuration::widget_traits(type);
    if (!is_container(type) || traits.count(after) >= traits.count(before)) {
      continue;
    }
    if (!dashboard.widgets.sync_count(type, traits.count(after))) {
      return decline("a container could not be released");
    }
  }

  if (!screens::apply_container_clipping(next, dashboard)) {
    return decline("LVGL is busy");
  }
  if (!screens::apply_z_order(next, dashboard)) {
    return decline("LVGL is busy");
  }
  if (slots_touched) {
    if (!lvgl_port_lock(0)) {
      return decline("LVGL is busy");
    }
    const bool attached = screens::attach_slots(next, dashboard);
    lvgl_port_unlock();
    if (!attached) {
      return decline("a slot could not be rebound");
    }
  }
  if (!screens::bind_actions(next, dashboard)) {
    return decline("a tap target could not be bound");
  }
  assets::release_unused_fonts(next, dashboard.fonts);
  return true;
}

}
