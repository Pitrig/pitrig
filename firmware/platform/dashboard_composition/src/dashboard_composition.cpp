#include "dashboard_composition.hpp"

#include "image_asset_service.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string_view>

#include "application_configuration.hpp"
#include "boot_splash.hpp"
#include "dashboard_layout.hpp"
#include "display.hpp"
#include "font_asset_service.hpp"
#include "logger.hpp"
#include "module_composition.hpp"
#include "simcore_features.hpp"
#include "telemetry_events.hpp"
#include "telemetry_registry.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::dashboard_composition {
namespace {

constexpr char kTag[] = "dashboard";
constexpr std::uint32_t kMinimumStartupScreenDurationMs = 1'000;
constexpr std::uint32_t kDefaultBackgroundColor = 0x000000;

// Resolving a configured screen to an LVGL screen happens here and nowhere
// else. Index zero stays the display's active screen, which is what keeps the
// boot splash, the initial black paint, and the forced-refresh invalidation
// correct without a second mechanism; every screen above it is created and owned
// here. Nothing above this function knows which of the two a screen is, except
// destroy(), which deletes only what this created.
lv_obj_t* screen_object(lv_display_t* const display, const std::size_t index) {
  if (index == 0) {
    return lv_display_get_screen_active(display);
  }
  lv_obj_t* const screen = lv_obj_create(nullptr);
  if (screen == nullptr) {
    return nullptr;
  }
  // A screen is a container for widgets that place themselves absolutely, so it
  // must not scroll or paint a border of its own.
  lv_obj_remove_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_pad_all(screen, 0, LV_PART_MAIN);
  lv_obj_set_style_border_width(screen, 0, LV_PART_MAIN);
  return screen;
}

// The screens a configuration asks for, in configuration order. An empty
// dashboard still gets one, so a bare document renders a background.
std::size_t create_screens(
    lv_display_t* const display,
    const configuration::ApplicationConfiguration& configuration,
    std::span<lv_obj_t*> screens) {
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
    const std::span<lv_obj_t* const> screens, const std::span<lv_obj_t*> groups) {
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
      lv_obj_remove_flag(container, LV_OBJ_FLAG_SCROLLABLE);
      lv_obj_set_style_pad_all(container, 0, LV_PART_MAIN);
      lv_obj_set_style_border_width(container, 0, LV_PART_MAIN);
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

bool will_render_content(
    const configuration::ApplicationConfiguration& configuration) {
#if SIMCORE_DEBUG
  (void)configuration;
  return true;
#else
  const configuration::ScreenConfiguration& screen =
      active_screen(configuration);
  return screen.background_color != kDefaultBackgroundColor ||
         screen.widget_count > 0;
#endif
}

telemetry::TelemetryRead read_lap_timer_modifier(void* const context) {
  telemetry::TelemetryRead value{};
  if (context == nullptr) {
    return value;
  }
  const lap_timer::LapTimer::Snapshot snapshot =
      static_cast<lap_timer::LapTimer*>(context)->snapshot();
  value.handle.type = telemetry::ValueType::uint32;
  value.value.typed.uint32_value = snapshot.time_ms;
  value.available = snapshot.available;
  return value;
}

bool create_text_widgets(void* const context) {
  auto& widgets = *static_cast<TextWidgets*>(context);
  const std::span configurations{
      widgets.dashboard->text_widgets.data(),
      static_cast<std::size_t>(widgets.dashboard->text_widget_count)};
  if (!widgets.binder.bind(configurations, *widgets.registry, *widgets.telemetry,
                           widgets.lap_timer_modifier)) {
    log::error(kTag, "Failed to resolve Text widget bindings");
    return false;
  }
  if (!widgets.collection.create(widgets.layout, configurations,
                                 widgets.binder.bindings(), *widgets.fonts)) {
    log::error(kTag, "Failed to create Text widgets");
    return false;
  }
  return true;
}

void destroy_text_widgets(void* const context) {
  static_cast<TextWidgets*>(context)->collection.destroy();
}

lv_obj_t* text_widget_root(void* const context, const std::uint8_t index) {
  return static_cast<TextWidgets*>(context)->collection.root_object(index);
}

bool update_text_widget(void* const context, const std::uint8_t index) {
  auto& widgets = *static_cast<TextWidgets*>(context);
  const std::span configurations{
      widgets.dashboard->text_widgets.data(),
      static_cast<std::size_t>(widgets.dashboard->text_widget_count)};
  if (index >= configurations.size()) {
    return false;
  }
  // Re-resolving every binding is pure computation over a bounded array and no
  // LVGL work, so it is cheaper than tracking which binding changed.
  if (!widgets.binder.bind(configurations, *widgets.registry, *widgets.telemetry,
                           widgets.lap_timer_modifier)) {
    return false;
  }
  return widgets.collection.recreate(index, widgets.layout,
                                     configurations[index],
                                     widgets.binder.bindings()[index],
                                     *widgets.fonts);
}

void wake_text_widgets(void* const context) {
  static_cast<TextWidgets*>(context)->collection.wake();
}

bool create_bar_widgets(void* const context) {
  auto& widgets = *static_cast<BarWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->bar_widget_count);
  const std::span configurations{widgets.dashboard->bar_widgets.data(), count};
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    log::error(kTag, "Failed to resolve Bar widget bindings");
    return false;
  }
  if (!widgets.collection.create(widgets.layout, configurations,
                                 widgets.binder.bindings(), *widgets.fonts)) {
    log::error(kTag, "Failed to create Bar widgets");
    return false;
  }
  return true;
}

void destroy_bar_widgets(void* const context) {
  static_cast<BarWidgets*>(context)->collection.destroy();
}

lv_obj_t* bar_widget_root(void* const context, const std::uint8_t index) {
  return static_cast<BarWidgets*>(context)->collection.root_object(index);
}

bool update_bar_widget(void* const context, const std::uint8_t index) {
  auto& widgets = *static_cast<BarWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->bar_widget_count);
  if (index >= count) {
    return false;
  }
  const std::span configurations{widgets.dashboard->bar_widgets.data(), count};
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    return false;
  }
  return widgets.collection.recreate(index, widgets.layout,
                                     configurations[index],
                                     widgets.binder.bindings()[index],
                                     *widgets.fonts);
}

void wake_bar_widgets(void* const context) {
  static_cast<BarWidgets*>(context)->collection.wake();
}

bool create_arc_widgets(void* const context) {
  auto& widgets = *static_cast<ArcWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->arc_widget_count);
  const std::span configurations{widgets.dashboard->arc_widgets.data(), count};
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    log::error(kTag, "Failed to resolve Arc widget bindings");
    return false;
  }
  if (!widgets.collection.create(widgets.layout, configurations,
                                 widgets.binder.bindings(), *widgets.fonts)) {
    log::error(kTag, "Failed to create Arc widgets");
    return false;
  }
  return true;
}

void destroy_arc_widgets(void* const context) {
  static_cast<ArcWidgets*>(context)->collection.destroy();
}

lv_obj_t* arc_widget_root(void* const context, const std::uint8_t index) {
  return static_cast<ArcWidgets*>(context)->collection.root_object(index);
}

bool update_arc_widget(void* const context, const std::uint8_t index) {
  auto& widgets = *static_cast<ArcWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->arc_widget_count);
  if (index >= count) {
    return false;
  }
  const std::span configurations{widgets.dashboard->arc_widgets.data(), count};
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    return false;
  }
  return widgets.collection.recreate(index, widgets.layout,
                                     configurations[index],
                                     widgets.binder.bindings()[index],
                                     *widgets.fonts);
}

void wake_arc_widgets(void* const context) {
  static_cast<ArcWidgets*>(context)->collection.wake();
}

bool create_indicator_widgets(void* const context) {
  auto& widgets = *static_cast<IndicatorWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->indicator_widget_count);
  const std::span configurations{widgets.dashboard->indicator_widgets.data(), count};
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    log::error(kTag, "Failed to resolve Indicator widget bindings");
    return false;
  }
  if (!widgets.collection.create(widgets.layout, configurations,
                                 widgets.binder.bindings(), *widgets.fonts)) {
    log::error(kTag, "Failed to create Indicator widgets");
    return false;
  }
  return true;
}

void destroy_indicator_widgets(void* const context) {
  static_cast<IndicatorWidgets*>(context)->collection.destroy();
}

lv_obj_t* indicator_widget_root(void* const context, const std::uint8_t index) {
  return static_cast<IndicatorWidgets*>(context)->collection.root_object(index);
}

bool update_indicator_widget(void* const context, const std::uint8_t index) {
  auto& widgets = *static_cast<IndicatorWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->indicator_widget_count);
  if (index >= count) {
    return false;
  }
  const std::span configurations{widgets.dashboard->indicator_widgets.data(), count};
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    return false;
  }
  return widgets.collection.recreate(index, widgets.layout,
                                     configurations[index],
                                     widgets.binder.bindings()[index],
                                     *widgets.fonts);
}

void wake_indicator_widgets(void* const context) {
  static_cast<IndicatorWidgets*>(context)->collection.wake();
}

bool create_graph_widgets(void* const context) {
  auto& widgets = *static_cast<GraphWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->graph_widget_count);
  const std::span configurations{widgets.dashboard->graph_widgets.data(), count};
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    log::error(kTag, "Failed to resolve Graph widget bindings");
    return false;
  }
  if (!widgets.collection.create(widgets.layout, configurations,
                                 widgets.binder.bindings(), *widgets.fonts)) {
    log::error(kTag, "Failed to create Graph widgets");
    return false;
  }
  return true;
}

void destroy_graph_widgets(void* const context) {
  static_cast<GraphWidgets*>(context)->collection.destroy();
}

lv_obj_t* graph_widget_root(void* const context, const std::uint8_t index) {
  return static_cast<GraphWidgets*>(context)->collection.root_object(index);
}

bool update_graph_widget(void* const context, const std::uint8_t index) {
  auto& widgets = *static_cast<GraphWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->graph_widget_count);
  if (index >= count) {
    return false;
  }
  const std::span configurations{widgets.dashboard->graph_widgets.data(), count};
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    return false;
  }
  return widgets.collection.recreate(index, widgets.layout,
                                     configurations[index],
                                     widgets.binder.bindings()[index],
                                     *widgets.fonts);
}

void wake_graph_widgets(void* const context) {
  static_cast<GraphWidgets*>(context)->collection.wake();
}


bool create_shape_widgets(void* const context) {
  auto& widgets = *static_cast<ShapeWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->shape_widget_count);
  const std::span configurations{widgets.dashboard->shape_widgets.data(), count};
  // A shape binds no telemetry of its own; only its styling rules watch one.
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    log::error(kTag, "Failed to resolve Shape widget conditions");
    return false;
  }
  if (!widgets.collection.create(widgets.layout, configurations,
                                 widgets.binder.reads(),
                                 widgets.binder.contexts(), *widgets.fonts)) {
    log::error(kTag, "Failed to create Shape widgets");
    return false;
  }
  return true;
}

void destroy_shape_widgets(void* const context) {
  static_cast<ShapeWidgets*>(context)->collection.destroy();
}

lv_obj_t* shape_widget_root(void* const context, const std::uint8_t index) {
  return static_cast<ShapeWidgets*>(context)->collection.root_object(index);
}

bool update_shape_widget(void* const context, const std::uint8_t index) {
  auto& widgets = *static_cast<ShapeWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->shape_widget_count);
  if (index >= count) {
    return false;
  }
  const std::span configurations{widgets.dashboard->shape_widgets.data(), count};
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    return false;
  }
  return widgets.collection.recreate(index, widgets.layout,
                                     configurations[index],
                                     widgets.binder.reads()[index],
                                     widgets.binder.contexts()[index],
                                     *widgets.fonts);
}

void wake_shape_widgets(void* const context) {
  static_cast<ShapeWidgets*>(context)->collection.wake();
}

bool create_image_widgets(void* const context) {
  auto& widgets = *static_cast<ImageWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->image_widget_count);
  const std::span configurations{widgets.dashboard->image_widgets.data(), count};
  // An image binds no telemetry of its own; only its styling rules watch one.
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    log::error(kTag, "Failed to resolve Image widget conditions");
    return false;
  }
  if (!widgets.collection.create(widgets.layout, configurations,
                                 widgets.binder.reads(),
                                 widgets.binder.contexts(), *widgets.fonts,
                                 *widgets.images)) {
    log::error(kTag, "Failed to create Image widgets");
    return false;
  }
  return true;
}

void destroy_image_widgets(void* const context) {
  static_cast<ImageWidgets*>(context)->collection.destroy();
}

lv_obj_t* image_widget_root(void* const context, const std::uint8_t index) {
  return static_cast<ImageWidgets*>(context)->collection.root_object(index);
}

bool update_image_widget(void* const context, const std::uint8_t index) {
  auto& widgets = *static_cast<ImageWidgets*>(context);
  const std::size_t count =
      static_cast<std::size_t>(widgets.dashboard->image_widget_count);
  if (index >= count) {
    return false;
  }
  const std::span configurations{widgets.dashboard->image_widgets.data(), count};
  if (!widgets.binder.bind(configurations, *widgets.registry,
                           *widgets.telemetry, widgets.lap_timer_modifier)) {
    return false;
  }
  return widgets.collection.recreate(index, widgets.layout,
                                     configurations[index],
                                     widgets.binder.reads()[index],
                                     widgets.binder.contexts()[index],
                                     *widgets.fonts, *widgets.images);
}

void wake_image_widgets(void* const context) {
  static_cast<ImageWidgets*>(context)->collection.wake();
}

// Runs on the render-trigger task with the LVGL lock held.
void wake_widgets(void* const context) {
  static_cast<Dashboard*>(context)->widgets.wake_all();
}

// Runs on the task that committed the telemetry update; must stay cheap.
void on_telemetry_updated(const events::Event&, void* const context) {
  // A refresh that is already drawing holds the LVGL lock until the display
  // accepts the frame, and its widget timers are overdue by then, so the pass
  // that follows reads this update without any wake. Asking anyway would only
  // put the trigger task in the lock queue ahead of the next refresh.
  if (display::rendering_in_progress()) {
    return;
  }
  static_cast<Dashboard*>(context)->render_trigger.request();
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

// The frame behind one reference. The pool is typed, so reaching a property
// every widget shares still needs the discriminator once.
const configuration::WidgetFrame* widget_frame(
    const configuration::DashboardConfiguration& dashboard,
    const configuration::WidgetReference& reference) {
  switch (reference.type) {
    case configuration::WidgetType::text:
      return reference.index < dashboard.text_widget_count
                 ? &dashboard.text_widgets[reference.index].frame
                 : nullptr;
    case configuration::WidgetType::shape:
      return reference.index < dashboard.shape_widget_count
                 ? &dashboard.shape_widgets[reference.index].frame
                 : nullptr;
    case configuration::WidgetType::bar:
      return reference.index < dashboard.bar_widget_count
                 ? &dashboard.bar_widgets[reference.index].frame
                 : nullptr;
    case configuration::WidgetType::arc:
      return reference.index < dashboard.arc_widget_count
                 ? &dashboard.arc_widgets[reference.index].frame
                 : nullptr;
    case configuration::WidgetType::indicator:
      return reference.index < dashboard.indicator_widget_count
                 ? &dashboard.indicator_widgets[reference.index].frame
                 : nullptr;
    case configuration::WidgetType::graph:
      return reference.index < dashboard.graph_widget_count
                 ? &dashboard.graph_widgets[reference.index].frame
                 : nullptr;
    case configuration::WidgetType::image:
      return reference.index < dashboard.image_widget_count
                 ? &dashboard.image_widgets[reference.index].frame
                 : nullptr;
  }
  return nullptr;
}

// The screen an action names, resolved once here so a tap performs no lookup.
// A name that matches nothing was already refused by validation; falling back to
// the current screen keeps a hand-built document from navigating somewhere
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

// Makes every authored tap target clickable. Widget roots come through the same
// accessor the z-order pass uses, so this knows no widget types; a group's
// container is a tap target in its own right, which is what makes an empty
// group an invisible touch zone.
//
// Re-run after any rebuild: update_instance() replaces a widget's LVGL object,
// and the replacement carries neither the flag nor the callback.
bool bind_widget_actions(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard) {
  dashboard.navigation.clear_actions();
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
              widget_frame(configuration.dashboard, reference);
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

bool apply_widget_z_order(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard) {
  const configuration::DashboardConfiguration& dashboard_configuration =
      configuration.dashboard;
  for (std::size_t index = 0;
       index < dashboard_configuration.screen_count; ++index) {
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

}  // namespace

bool show_startup_screen(
    lv_display_t* const display,
    const configuration::ApplicationConfiguration& configuration) {
  return dashboard::boot_splash::show(
      display, screen_object(display, 0), kMinimumStartupScreenDurationMs,
      !will_render_content(configuration));
}

// Visits every font a configuration renders with, together with the characters
// that configuration supplies for it. Fonts the runtime emits on its own are
// warmed by the registry.
template <typename Visitor>
void for_each_configured_font(
    const configuration::ApplicationConfiguration& configuration,
    Visitor&& visit) {
  // Widget storage is one pool, so every screen's fonts are covered by walking
  // it once.
  const configuration::DashboardConfiguration& dashboard =
      configuration.dashboard;
  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    const configuration::TextWidgetConfiguration& widget =
        dashboard.text_widgets[index];
    visit(widget.value.font, widget.value.unavailable_text);
    // Affixes belong to the transform rather than to one of its types, so they
    // are rendered whatever the type is, for every source the widget composes.
    for (std::size_t source = 0; source < widget.source_count; ++source) {
      visit(widget.value.font, widget.sources[source].transform.prefix);
      visit(widget.value.font, widget.sources[source].transform.suffix);
    }
  }
  // A caption belongs to the frame, so every framed type can carry one.
  const auto visit_caption = [&visit](const configuration::WidgetFrame& frame) {
    if (frame.title.text.front() != '\0') {
      visit(frame.title.font, frame.title.text);
    }
  };
  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    visit_caption(dashboard.text_widgets[index].frame);
  }
  for (std::size_t index = 0; index < dashboard.shape_widget_count; ++index) {
    visit_caption(dashboard.shape_widgets[index].frame);
  }
  for (std::size_t index = 0; index < dashboard.bar_widget_count; ++index) {
    visit_caption(dashboard.bar_widgets[index].frame);
  }
  for (std::size_t index = 0; index < dashboard.arc_widget_count; ++index) {
    visit_caption(dashboard.arc_widgets[index].frame);
  }
  for (std::size_t index = 0; index < dashboard.indicator_widget_count;
       ++index) {
    visit_caption(dashboard.indicator_widgets[index].frame);
  }
  for (std::size_t index = 0; index < dashboard.graph_widget_count; ++index) {
    visit_caption(dashboard.graph_widgets[index].frame);
  }
  for (std::size_t index = 0; index < dashboard.image_widget_count; ++index) {
    visit_caption(dashboard.image_widgets[index].frame);
  }
}

// Creates the fonts this configuration renders with and drops the ones it no
// longer needs. Runs with the previous widgets already destroyed, so no label
// can be pointing at a font object being released.
bool prepare_fonts(
    const configuration::ApplicationConfiguration& configuration,
    dashboard::fonts::Registry& fonts) {
  fonts.retain_if([&configuration](const font_assets::FontSpec& spec) {
    bool used = false;
    for_each_configured_font(
        configuration, [&spec, &used](const font_assets::FontSpec& candidate,
                                      const std::span<const char>) {
          used = used || candidate == spec;
        });
    return used;
  });

  bool complete = true;
  for_each_configured_font(
      configuration, [&fonts, &complete](const font_assets::FontSpec& spec,
                                         const std::span<const char> text) {
        if (!fonts.acquire(spec)) {
          complete = false;
          return;
        }
        fonts.warm(spec, text);
      });
  return complete;
}

bool create(lv_display_t* const display,
            const configuration::ApplicationConfiguration& configuration,
            module_composition::Modules& modules, Dashboard& dashboard_state,
            const telemetry::ITelemetryRegistry& telemetry_registry,
            const telemetry::ITelemetryReader& telemetry,
            const transport::ITransport& telemetry_transport) {
  if (display == nullptr) {
    log::error(kTag, "Dashboard display is unavailable");
    return false;
  }
  dashboard_state.screens = {};
  dashboard_state.groups = {};
  if (!lvgl_port_lock(0)) {
    log::error(kTag, "Failed to lock LVGL for dashboard screens");
    return false;
  }
  const std::size_t screen_count =
      create_screens(display, configuration, dashboard_state.screens);
  for (std::size_t index = 0; index < screen_count; ++index) {
    lv_obj_t* const screen = dashboard_state.screens[index];
    lv_obj_set_style_bg_color(
        screen, lv_color_hex(screen_background(configuration, index)),
        LV_PART_MAIN);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);
  }
  create_groups(configuration,
                std::span{dashboard_state.screens}.first(screen_count),
                dashboard_state.groups);
  lvgl_port_unlock();
  const dashboard::Layout layout{
      .display = display,
      .screens = std::span{dashboard_state.screens}.first(screen_count),
      .groups = dashboard_state.groups};
  if (screen_count == 0) {
    log::error(kTag, "Dashboard screen is unavailable");
    return false;
  }
  if (!prepare_fonts(configuration, dashboard_state.fonts)) {
    log::error(kTag, "One or more configured fonts could not be created");
    return false;
  }

  bool initialized = true;
  {
    dashboard_state.text.layout = layout;
    dashboard_state.text.dashboard = &configuration.dashboard;
    dashboard_state.text.fonts = &dashboard_state.fonts;
    dashboard_state.text.registry = &telemetry_registry;
    dashboard_state.text.telemetry = &telemetry;
    dashboard_state.bar.layout = layout;
    dashboard_state.bar.dashboard = &configuration.dashboard;
    dashboard_state.bar.registry = &telemetry_registry;
    dashboard_state.bar.telemetry = &telemetry;
    dashboard_state.bar.fonts = &dashboard_state.fonts;
    dashboard_state.arc.layout = layout;
    dashboard_state.arc.dashboard = &configuration.dashboard;
    dashboard_state.arc.registry = &telemetry_registry;
    dashboard_state.arc.telemetry = &telemetry;
    dashboard_state.arc.fonts = &dashboard_state.fonts;
    dashboard_state.indicator.layout = layout;
    dashboard_state.indicator.dashboard = &configuration.dashboard;
    dashboard_state.indicator.registry = &telemetry_registry;
    dashboard_state.indicator.telemetry = &telemetry;
    dashboard_state.indicator.fonts = &dashboard_state.fonts;
    dashboard_state.graph.layout = layout;
    dashboard_state.graph.dashboard = &configuration.dashboard;
    dashboard_state.graph.registry = &telemetry_registry;
    dashboard_state.graph.telemetry = &telemetry;
    dashboard_state.graph.fonts = &dashboard_state.fonts;
    dashboard_state.image.layout = layout;
    dashboard_state.image.dashboard = &configuration.dashboard;
    dashboard_state.image.registry = &telemetry_registry;
    dashboard_state.image.telemetry = &telemetry;
    dashboard_state.image.fonts = &dashboard_state.fonts;
    dashboard_state.image.images = &dashboard_state.images;
    dashboard_state.shape.layout = layout;
    dashboard_state.shape.dashboard = &configuration.dashboard;
    dashboard_state.shape.registry = &telemetry_registry;
    dashboard_state.shape.telemetry = &telemetry;
    dashboard_state.shape.fonts = &dashboard_state.fonts;
    dashboard_state.text.lap_timer_modifier = {
        .read = modules.lap_timer_started ? &read_lap_timer_modifier : nullptr,
        .context = modules.lap_timer_started
                       ? static_cast<void*>(&modules.lap_timer)
                       : nullptr,
    };

    // Widget presence in the configuration decides which descriptors run. The
    // manager itself knows nothing about either widget type. The table is
    // assembled under the LVGL lock because the render trigger walks it under
    // that lock from its own task.
    if (!lvgl_port_lock(0)) {
      log::error(kTag, "Failed to lock LVGL for the widget table");
      return false;
    }
    dashboard_state.widgets.clear();
    const bool registered =
        dashboard_state.widgets.add({
            .type = configuration::WidgetType::text,
            .enabled = configuration.dashboard.text_widget_count > 0,
            .create = &create_text_widgets,
            .destroy = &destroy_text_widgets,
            .root_object = &text_widget_root,
            .update_instance = &update_text_widget,
            .wake = &wake_text_widgets,
            .context = &dashboard_state.text,
        }) &&
        dashboard_state.widgets.add({
            .type = configuration::WidgetType::shape,
            .enabled = configuration.dashboard.shape_widget_count > 0,
            .create = &create_shape_widgets,
            .destroy = &destroy_shape_widgets,
            .root_object = &shape_widget_root,
            .update_instance = &update_shape_widget,
            .wake = &wake_shape_widgets,
            .context = &dashboard_state.shape,
        }) &&
        dashboard_state.widgets.add({
            .type = configuration::WidgetType::bar,
            .enabled = configuration.dashboard.bar_widget_count > 0,
            .create = &create_bar_widgets,
            .destroy = &destroy_bar_widgets,
            .root_object = &bar_widget_root,
            .update_instance = &update_bar_widget,
            .wake = &wake_bar_widgets,
            .context = &dashboard_state.bar,
        }) &&
        dashboard_state.widgets.add({
            .type = configuration::WidgetType::arc,
            .enabled = configuration.dashboard.arc_widget_count > 0,
            .create = &create_arc_widgets,
            .destroy = &destroy_arc_widgets,
            .root_object = &arc_widget_root,
            .update_instance = &update_arc_widget,
            .wake = &wake_arc_widgets,
            .context = &dashboard_state.arc,
        }) &&
        dashboard_state.widgets.add({
            .type = configuration::WidgetType::indicator,
            .enabled = configuration.dashboard.indicator_widget_count > 0,
            .create = &create_indicator_widgets,
            .destroy = &destroy_indicator_widgets,
            .root_object = &indicator_widget_root,
            .update_instance = &update_indicator_widget,
            .wake = &wake_indicator_widgets,
            .context = &dashboard_state.indicator,
        }) &&
        dashboard_state.widgets.add({
            .type = configuration::WidgetType::graph,
            .enabled = configuration.dashboard.graph_widget_count > 0,
            .create = &create_graph_widgets,
            .destroy = &destroy_graph_widgets,
            .root_object = &graph_widget_root,
            .update_instance = &update_graph_widget,
            .wake = &wake_graph_widgets,
            .context = &dashboard_state.graph,
        }) &&
        dashboard_state.widgets.add({
            .type = configuration::WidgetType::image,
            .enabled = configuration.dashboard.image_widget_count > 0,
            .create = &create_image_widgets,
            .destroy = &destroy_image_widgets,
            .root_object = &image_widget_root,
            .update_instance = &update_image_widget,
            .wake = &wake_image_widgets,
            .context = &dashboard_state.image,
        });
    lvgl_port_unlock();
    if (!registered) {
      log::error(kTag, "Failed to register dashboard widget types");
      initialized = false;
    } else if (!dashboard_state.widgets.create_all()) {
      initialized = false;
    }
    if (!apply_widget_z_order(configuration, dashboard_state)) {
      log::error(kTag, "Failed to apply dashboard widget Z order");
      initialized = false;
    }
  }

  // Slots and navigation are attached last, so a tap or a gesture can only
  // arrive at screens that are fully built. A rebuilt dashboard has new screen
  // objects, so this also returns to the first screen and to each slot's
  // authored group.
  if (lvgl_port_lock(0)) {
    // Same module reader the widgets bind through; the text widget names the
    // type in its own namespace, so it is restated rather than copied across.
    const dashboard::frame::ModifierReader lap_timer_modifier{
        .read = modules.lap_timer_started ? &read_lap_timer_modifier : nullptr,
        .context = modules.lap_timer_started
                       ? static_cast<void*>(&modules.lap_timer)
                       : nullptr,
    };
    for (std::size_t screen_index = 0; screen_index < screen_count;
         ++screen_index) {
      const configuration::ScreenConfiguration& screen =
          configuration.dashboard.screens[screen_index];
      for (std::size_t index = 0; index < screen.group_count; ++index) {
        lv_obj_t* const container = layout.group(
            static_cast<std::uint8_t>(screen_index),
            static_cast<std::uint8_t>(index));
        if (container != nullptr &&
            !dashboard_state.slots.add(container, screen.groups[index],
                                       telemetry_registry, telemetry,
                                       lap_timer_modifier)) {
          log::error(kTag, "Failed to bind group activation source");
          initialized = false;
        }
      }
    }
    if (!dashboard_state.slots.start()) {
      log::error(kTag, "Failed to start dashboard slots");
      initialized = false;
    }
    dashboard_state.navigation.attach(layout.screens);
    lvgl_port_unlock();
  } else {
    log::warn(kTag, "Failed to lock LVGL for slots and screen navigation");
  }

  // After attach(), which resets the controller and therefore the bindings.
  if (!bind_widget_actions(configuration, dashboard_state)) {
    log::error(kTag, "Failed to bind dashboard tap actions");
    initialized = false;
  }

#if SIMCORE_DEBUG
  if (!dashboard_state.performance_overlay.create(display,
                                                  telemetry_transport)) {
    log::warn(kTag, "Failed to create performance overlay");
  }
#else
  (void)telemetry_transport;
#endif
  return initialized;
}

// Widget configurations are trivially copyable aggregates, so a byte compare is
// an exact change test. Padding can only produce a false "changed", which costs
// one extra rebuild; it can never produce a false "unchanged".
template <typename Widget>
bool widget_changed(const Widget& left, const Widget& right) {
  return std::memcmp(&left, &right, sizeof(Widget)) != 0;
}

// Only the face has to be installed: every pixel size is rasterized from it, so
// a configuration that asks for a size the device has never rendered composes
// without an upload.
// A caption needs its family installed like any other text.
[[nodiscard]] bool captioned(const configuration::WidgetFrame& frame,
                             const dashboard::fonts::Registry& fonts) {
  return frame.title.text.front() == '\0' ||
         fonts.has_family(frame.title.font.family);
}

bool load_images(Dashboard& dashboard, const image_assets::Service& image_assets,
                 const std::span<std::uint8_t> storage) {
  return dashboard.images.load(image_assets.images(), storage);
}

bool images_available(
    const configuration::ApplicationConfiguration& configuration,
    const dashboard::images::Registry& images) {
  const configuration::DashboardConfiguration& dashboard =
      configuration.dashboard;
  for (std::size_t index = 0; index < dashboard.image_widget_count; ++index) {
    if (!images.has_image(dashboard.image_widgets[index].image)) {
      return false;
    }
  }
  return true;
}

bool fonts_available(
    const configuration::ApplicationConfiguration& configuration,
    const dashboard::fonts::Registry& fonts) {
  // The pool is what gets composed, so checking it directly covers every screen
  // and cannot check the same widget twice.
  const configuration::DashboardConfiguration& dashboard =
      configuration.dashboard;
  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    const auto& widget = dashboard.text_widgets[index];
    if (!fonts.has_family(widget.value.font.family) ||
        !captioned(widget.frame, fonts)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.shape_widget_count; ++index) {
    if (!captioned(dashboard.shape_widgets[index].frame, fonts)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.bar_widget_count; ++index) {
    if (!captioned(dashboard.bar_widgets[index].frame, fonts)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.arc_widget_count; ++index) {
    if (!captioned(dashboard.arc_widgets[index].frame, fonts)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.indicator_widget_count;
       ++index) {
    if (!captioned(dashboard.indicator_widgets[index].frame, fonts)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.graph_widget_count; ++index) {
    if (!captioned(dashboard.graph_widgets[index].frame, fonts)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.image_widget_count; ++index) {
    if (!captioned(dashboard.image_widgets[index].frame, fonts)) {
      return false;
    }
  }
  return true;
}

bool apply_incremental(
    const configuration::ApplicationConfiguration& previous,
    const configuration::ApplicationConfiguration& next, Dashboard& dashboard) {
  const configuration::DashboardConfiguration& before = previous.dashboard;
  const configuration::DashboardConfiguration& after = next.dashboard;

  // A different widget set, order, or storage layout is structural: a screen's
  // reference table carries type, storage index, and the z_index ordering key,
  // so equal tables mean compositing cannot have changed either.
  if (before.screen_count != after.screen_count ||
      before.text_widget_count != after.text_widget_count ||
      before.shape_widget_count != after.shape_widget_count ||
      before.bar_widget_count != after.bar_widget_count ||
      before.arc_widget_count != after.arc_widget_count ||
      before.indicator_widget_count != after.indicator_widget_count ||
      before.graph_widget_count != after.graph_widget_count ||
      before.image_widget_count != after.image_widget_count) {
    return false;
  }
  for (std::size_t index = 0; index < after.screen_count; ++index) {
    const configuration::ScreenConfiguration& before_screen =
        before.screens[index];
    const configuration::ScreenConfiguration& after_screen =
        after.screens[index];
    if (before_screen.widget_count != after_screen.widget_count ||
        std::memcmp(before_screen.widgets.data(), after_screen.widgets.data(),
                    after_screen.widget_count *
                        sizeof(configuration::WidgetReference)) != 0) {
      return false;
    }
    // A group is a parent and a slot member, so anything about it beyond its
    // widgets' own properties changes composition rather than a widget.
    if (before_screen.group_count != after_screen.group_count) {
      return false;
    }
    for (std::size_t group = 0; group < after_screen.group_count; ++group) {
      const configuration::GroupConfiguration& before_group =
          before_screen.groups[group];
      const configuration::GroupConfiguration& after_group =
          after_screen.groups[group];
      if (std::memcmp(&before_group, &after_group,
                      sizeof(configuration::GroupConfiguration)) != 0) {
        return false;
      }
    }
  }

  // Widget contexts point into the document that was active when they were
  // built. Promotion swapped that out, so repoint them before rebuilding.
  dashboard.text.dashboard = &after;
  dashboard.shape.dashboard = &after;
  dashboard.bar.dashboard = &after;
  dashboard.arc.dashboard = &after;
  dashboard.indicator.dashboard = &after;
  dashboard.graph.dashboard = &after;
  dashboard.image.dashboard = &after;

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
  }

  // Walking the pool rather than the reference tables compares each widget
  // once, whatever screen it belongs to, and cannot pair an index with the
  // wrong type's storage.
  const auto rebuild_changed = [&dashboard](const auto& before_widgets,
                                            const auto& after_widgets,
                                            const std::size_t count,
                                            const configuration::WidgetType
                                                type) {
    for (std::size_t index = 0; index < count; ++index) {
      if (!widget_changed(before_widgets[index], after_widgets[index])) {
        continue;
      }
      if (!dashboard.widgets.update_instance(
              type, static_cast<std::uint8_t>(index))) {
        return false;
      }
    }
    return true;
  };
  if (!rebuild_changed(before.text_widgets, after.text_widgets,
                       after.text_widget_count,
                       configuration::WidgetType::text) ||
      !rebuild_changed(before.shape_widgets, after.shape_widgets,
                       after.shape_widget_count,
                       configuration::WidgetType::shape) ||
      !rebuild_changed(before.bar_widgets, after.bar_widgets,
                       after.bar_widget_count,
                       configuration::WidgetType::bar) ||
      !rebuild_changed(before.arc_widgets, after.arc_widgets,
                       after.arc_widget_count,
                       configuration::WidgetType::arc) ||
      !rebuild_changed(before.indicator_widgets, after.indicator_widgets,
                       after.indicator_widget_count,
                       configuration::WidgetType::indicator) ||
      !rebuild_changed(before.graph_widgets, after.graph_widgets,
                       after.graph_widget_count,
                       configuration::WidgetType::graph) ||
      !rebuild_changed(before.image_widgets, after.image_widgets,
                       after.image_widget_count,
                       configuration::WidgetType::image)) {
    return false;
  }

  // Rebuilt widgets are new LVGL children, so they sit on top until the
  // configured order is applied again — and they are new objects, so their tap
  // actions have to be bound onto them again.
  return apply_widget_z_order(next, dashboard) &&
         bind_widget_actions(next, dashboard);
}

void destroy(Dashboard& dashboard) {
  // Cleared under the LVGL lock for the same reason create() assembles the
  // table under it: the render trigger may be walking it.
  if (lvgl_port_lock(0)) {
    dashboard.navigation.detach();
    dashboard.slots.clear();
    dashboard.widgets.clear();
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
    lvgl_port_unlock();
  }
  dashboard.performance_overlay.destroy();
}

bool load_fonts(Dashboard& dashboard, const font_assets::Service& font_assets,
                const std::span<std::uint8_t> storage) {
  if (!lvgl_port_lock(0)) {
    log::error(kTag, "Failed to lock LVGL for font loading");
    return false;
  }
  const bool loaded = dashboard.fonts.load(font_assets.families(), storage);
  lvgl_port_unlock();
  return loaded;
}

bool start_render_trigger(Dashboard& dashboard, events::EventBus& event_bus) {
  if (dashboard.render_trigger.started()) {
    return false;
  }
  if (!dashboard.render_trigger.start(&wake_widgets, &dashboard)) {
    log::error(kTag, "Failed to start the render trigger task");
    return false;
  }
  dashboard.telemetry_subscription = event_bus.subscribe(
      telemetry::kTelemetryUpdatedEvent, &on_telemetry_updated, &dashboard);
  if (!dashboard.telemetry_subscription.valid) {
    log::error(kTag, "Failed to subscribe the render trigger to telemetry");
    return false;
  }
  return true;
}

bool rebuild(lv_display_t* const display,
             const configuration::ApplicationConfiguration& configuration,
             module_composition::Modules& modules, Dashboard& dashboard,
             const telemetry::ITelemetryRegistry& telemetry_registry,
             const telemetry::ITelemetryReader& telemetry,
             const transport::ITransport& telemetry_transport) {
  destroy(dashboard);
  return create(display, configuration, modules, dashboard, telemetry_registry,
                telemetry, telemetry_transport);
}

}  // namespace simcore::dashboard_composition
