#include "dashboard_screens.hpp"
#include "dashboard_state.hpp"

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

void make_container(lv_obj_t* const object) {
  lv_obj_remove_flag(object, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_pad_all(object, 0, LV_PART_MAIN);
  lv_obj_set_style_border_width(object, 0, LV_PART_MAIN);
}

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

}

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

bool will_render_content(
    const configuration::ApplicationConfiguration& configuration) {
  const configuration::ScreenConfiguration& screen =
      active_screen(configuration);
  return SIMCORE_DEBUG_OVERLAY ||
         screen.background_color != kDefaultBackgroundColor ||
         screen.widget_count > 0;
}

std::size_t create(lv_display_t* const display,
                   const configuration::ApplicationConfiguration& configuration,
                   Dashboard& dashboard) {
  dashboard.screens = {};
  dashboard.containers = {};
  dashboard.container_overflow = {};
  dashboard.pages = {};
  dashboard.page_overflow = {};
  dashboard.slot_overflow = {};
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

namespace {

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
  for (std::size_t index = 0;
       index < configuration.dashboard.shape_widget_count; ++index) {
    const configuration::ShapeWidgetConfiguration& shape =
        configuration.dashboard.shape_widgets[index];
    bind_references(shape.widgets, shape.widget_count);
  }
  for (std::size_t index = 0;
       index < configuration.dashboard.slot_widget_count; ++index) {
    const configuration::SlotWidgetConfiguration& widget =
        configuration.dashboard.slot_widgets[index];
    for (std::size_t page = 0; page < widget.page_count; ++page) {
      bind_references(widget.pages[page].widgets,
                      widget.pages[page].widget_count);
    }
  }
  lvgl_port_unlock();
  return bound;
}

std::size_t extend(lv_display_t* const display,
                   const configuration::ApplicationConfiguration& configuration,
                   Dashboard& dashboard, const std::size_t from) {
  const std::size_t count =
      std::max<std::size_t>(configuration.dashboard.screen_count, 1);
  for (std::size_t index = from;
       index < count && index < dashboard.screens.size(); ++index) {
    lv_obj_t* const screen = screen_object(display, index);
    if (screen == nullptr) {
      return index;
    }
    dashboard.screens[index] = screen;
    lv_obj_set_style_bg_color(
        screen, lv_color_hex(screen_background(configuration, index)),
        LV_PART_MAIN);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);
  }
  return count;
}

bool attach_slots(const configuration::ApplicationConfiguration& configuration,
                  Dashboard& dashboard) {
  dashboard.slots.clear();
  bool attached = true;
  for (std::size_t index = 0; index < configuration.dashboard.slot_widget_count;
       ++index) {
    const configuration::SlotWidgetConfiguration& config =
        configuration.dashboard.slot_widgets[index];
    lv_obj_t* const container = dashboard.slot.collection.root_object(index);
    const std::span<lv_obj_t* const> pages =
        std::span{dashboard.pages}.subspan(
            index * configuration::kMaximumSlotPages,
            configuration::kMaximumSlotPages);
    if (container == nullptr || dashboard.slot.registry == nullptr ||
        dashboard.slot.telemetry == nullptr) {
      attached = false;
      continue;
    }
    if (!dashboard.slots.add(container, pages, config, *dashboard.slot.registry,
                             *dashboard.slot.telemetry,
                             dashboard.slot.modifier_readers)) {
      log::error("dashboard", "Failed to bind slot page source");
      attached = false;
    }
  }
  if (!dashboard.slots.start()) {
    log::error("dashboard", "Failed to start dashboard slots");
    attached = false;
  }
  return attached;
}

void release(Dashboard& dashboard) {
  dashboard.containers = {};
  dashboard.container_overflow = {};
  dashboard.pages = {};
  dashboard.page_overflow = {};
  dashboard.slot_overflow = {};
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

}
