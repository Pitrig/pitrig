#include "dashboard_composition.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>

#include "application_configuration.hpp"
#include "boot_splash.hpp"
#include "dashboard_layout.hpp"
#include "font_asset_service.hpp"
#include "logger.hpp"
#include "module_composition.hpp"
#include "simcore_features.hpp"
#include "telemetry_events.hpp"
#include "telemetry_registry.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#if SIMCORE_DISPLAY_DIAGNOSTICS
#include "display_diagnostics.hpp"
#endif

namespace simcore::dashboard_composition {
namespace {

constexpr char kTag[] = "dashboard";
constexpr std::uint32_t kMinimumStartupScreenDurationMs = 1'000;
constexpr std::uint32_t kDefaultBackgroundColor = 0x000000;

// The dashboard owns a bounded screen collection. Until screen navigation
// exists the composition renders the first one; an absent dashboard section
// yields a default screen with no widgets.
// Screen navigation does not exist yet, so the single configured screen renders
// on the display's active LVGL screen. Additional screens will be created here
// and swapped by a future navigation path; nothing above this function needs to
// know which of those is happening.
lv_obj_t* screen_object(lv_display_t* const display, const std::size_t index) {
  return index == 0 ? lv_display_get_screen_active(display) : nullptr;
}

const configuration::ScreenConfiguration& active_screen(
    const configuration::ApplicationConfiguration& configuration) {
  static const configuration::ScreenConfiguration kEmptyScreen{};
  return configuration.dashboard.screen_count > 0
             ? configuration.dashboard.screens[0]
             : kEmptyScreen;
}

bool will_render_content(
    const configuration::ApplicationConfiguration& configuration) {
#if SIMCORE_DISPLAY_DIAGNOSTICS || SIMCORE_DEBUG
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
      widgets.screen->text_widgets.data(),
      static_cast<std::size_t>(widgets.screen->text_widget_count)};
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
      widgets.screen->text_widgets.data(),
      static_cast<std::size_t>(widgets.screen->text_widget_count)};
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

bool create_delta_time_widget(void* const context) {
  auto& widgets = *static_cast<DeltaTimeWidgets*>(context);
  if (widgets.module == nullptr) {
    log::error(kTag, "Delta Time widget dependency is unavailable");
    return false;
  }
  if (!widgets.view.create(widgets.layout,
                           widgets.screen->delta_time_widgets[0],
                           *widgets.module, *widgets.fonts)) {
    log::error(kTag, "Failed to create Delta Time widget");
    return false;
  }
  return true;
}

void destroy_delta_time_widget(void* const context) {
  static_cast<DeltaTimeWidgets*>(context)->view.destroy();
}

lv_obj_t* delta_time_widget_root(void* const context, const std::uint8_t index) {
  return index == 0 ? static_cast<DeltaTimeWidgets*>(context)->view.root_object()
                    : nullptr;
}

bool update_delta_time_widget(void* const context, const std::uint8_t index) {
  if (index != 0) {
    return false;
  }
  static_cast<DeltaTimeWidgets*>(context)->view.destroy();
  return create_delta_time_widget(context);
}

void wake_delta_time_widget(void* const context) {
  static_cast<DeltaTimeWidgets*>(context)->view.wake();
}

// Runs on the render-trigger task with the LVGL lock held.
void wake_widgets(void* const context) {
  static_cast<Dashboard*>(context)->widgets.wake_all();
}

// Runs on the task that committed the telemetry update; must stay cheap.
void on_telemetry_updated(const events::Event&, void* const context) {
  static_cast<Dashboard*>(context)->render_trigger.request();
}

struct WidgetLayer {
  lv_obj_t* object{};
  std::int16_t z_index{};
  std::uint8_t configuration_order{};
};

bool apply_widget_z_order(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard) {
  const configuration::ScreenConfiguration& screen =
      active_screen(configuration);
  std::array<WidgetLayer, configuration::kMaximumWidgetsPerScreen> layers{};
  std::size_t count{};
  // Authored order breaks z_index ties, and the screen's reference table is
  // that order.
  for (std::size_t index = 0; index < screen.widget_count; ++index) {
    const configuration::WidgetReference& reference = screen.widgets[index];
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

}  // namespace

bool show_startup_screen(
    lv_display_t* const display,
    const configuration::ApplicationConfiguration& configuration) {
  return dashboard::boot_splash::show(
      display, screen_object(display, 0), kMinimumStartupScreenDurationMs,
      !will_render_content(configuration));
}

bool create(lv_display_t* const display,
            const configuration::ApplicationConfiguration& configuration,
            module_composition::Modules& modules, Dashboard& dashboard_state,
            const font_assets::Service& font_assets,
            const telemetry::ITelemetryRegistry& telemetry_registry,
            const telemetry::ITelemetryReader& telemetry,
            const transport::ITransport& telemetry_transport) {
  if (display == nullptr) {
    log::error(kTag, "Dashboard display is unavailable");
    return false;
  }
  const configuration::ScreenConfiguration& screen_configuration =
      active_screen(configuration);
  lv_obj_t* const screen = screen_object(display, 0);
  const dashboard::Layout layout{.display = display, .screen = screen};
  if (!lvgl_port_lock(0)) {
    log::error(kTag, "Failed to lock LVGL for dashboard background");
    return false;
  }
  if (screen != nullptr) {
    lv_obj_set_style_bg_color(
        screen, lv_color_hex(screen_configuration.background_color),
        LV_PART_MAIN);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);
  }
  lvgl_port_unlock();
  if (screen == nullptr) {
    log::error(kTag, "Dashboard screen is unavailable");
    return false;
  }
  if (!dashboard_state.fonts.initialize(font_assets)) {
    log::warn(kTag, "One or more font assets could not be loaded");
  }

  bool initialized = true;
  bool diagnostics_enabled = false;
#if SIMCORE_DISPLAY_DIAGNOSTICS
  diagnostics_enabled = true;
  if (!dashboard_state.display_diagnostics.create(
          display, screen, dashboard::display_diagnostics::Config{},
          dashboard_state.fonts)) {
    log::error(kTag, "Failed to start display diagnostics");
    initialized = false;
  }
#endif

  if (!diagnostics_enabled) {
    dashboard_state.text.layout = layout;
    dashboard_state.text.screen = &screen_configuration;
    dashboard_state.text.fonts = &dashboard_state.fonts;
    dashboard_state.text.registry = &telemetry_registry;
    dashboard_state.text.telemetry = &telemetry;
    dashboard_state.text.lap_timer_modifier = {
        .read = modules.lap_timer_started ? &read_lap_timer_modifier : nullptr,
        .context = modules.lap_timer_started
                       ? static_cast<void*>(&modules.lap_timer)
                       : nullptr,
    };
    dashboard_state.delta_time.layout = layout;
    dashboard_state.delta_time.screen = &screen_configuration;
    dashboard_state.delta_time.fonts = &dashboard_state.fonts;
    dashboard_state.delta_time.module =
        modules.delta_time_started ? &modules.delta_time : nullptr;

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
            .enabled = screen_configuration.text_widget_count > 0,
            .create = &create_text_widgets,
            .destroy = &destroy_text_widgets,
            .root_object = &text_widget_root,
            .update_instance = &update_text_widget,
            .wake = &wake_text_widgets,
            .context = &dashboard_state.text,
        }) &&
        dashboard_state.widgets.add({
            .type = configuration::WidgetType::delta_time,
            .enabled = screen_configuration.delta_time_widget_count > 0,
            .create = &create_delta_time_widget,
            .destroy = &destroy_delta_time_widget,
            .root_object = &delta_time_widget_root,
            .update_instance = &update_delta_time_widget,
            .wake = &wake_delta_time_widget,
            .context = &dashboard_state.delta_time,
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

bool fonts_available(
    const configuration::ApplicationConfiguration& configuration,
    const dashboard::fonts::Registry& fonts) {
  const configuration::ScreenConfiguration& screen =
      active_screen(configuration);
  for (std::size_t index = 0; index < screen.widget_count; ++index) {
    const configuration::WidgetReference& reference = screen.widgets[index];
    switch (reference.type) {
      case configuration::WidgetType::text: {
        const auto& widget = screen.text_widgets[reference.index];
        if (fonts.resolve(widget.value.font) == nullptr) {
          return false;
        }
        if (widget.title.text.front() != '\0' &&
            fonts.resolve(widget.title.font) == nullptr) {
          return false;
        }
        break;
      }
      case configuration::WidgetType::delta_time:
        if (fonts.resolve(screen.delta_time_widgets[reference.index].font) ==
            nullptr) {
          return false;
        }
        break;
    }
  }
  return true;
}

bool apply_incremental(
    const configuration::ApplicationConfiguration& previous,
    const configuration::ApplicationConfiguration& next, Dashboard& dashboard) {
  const configuration::ScreenConfiguration& before = active_screen(previous);
  const configuration::ScreenConfiguration& after = active_screen(next);

  // A different widget set, order, or storage layout is structural: the
  // reference table carries type, storage index, and the z_index ordering key,
  // so an equal table means compositing cannot have changed either.
  if (previous.dashboard.screen_count != next.dashboard.screen_count ||
      before.widget_count != after.widget_count ||
      before.text_widget_count != after.text_widget_count ||
      before.delta_time_widget_count != after.delta_time_widget_count ||
      std::memcmp(before.widgets.data(), after.widgets.data(),
                  after.widget_count *
                      sizeof(configuration::WidgetReference)) != 0) {
    return false;
  }

  // Widget contexts point into the document that was active when they were
  // built. Promotion swapped that out, so repoint them before rebuilding.
  dashboard.text.screen = &after;
  dashboard.delta_time.screen = &after;

  if (before.background_color != after.background_color) {
    if (!lvgl_port_lock(0)) {
      return false;
    }
    lv_obj_set_style_bg_color(dashboard.text.layout.screen,
                              lv_color_hex(after.background_color),
                              LV_PART_MAIN);
    lvgl_port_unlock();
  }

  for (std::size_t index = 0; index < after.widget_count; ++index) {
    const configuration::WidgetReference& reference = after.widgets[index];
    const bool changed =
        reference.type == configuration::WidgetType::text
            ? widget_changed(before.text_widgets[reference.index],
                             after.text_widgets[reference.index])
            : widget_changed(before.delta_time_widgets[reference.index],
                             after.delta_time_widgets[reference.index]);
    if (!changed) {
      continue;
    }
    if (!dashboard.widgets.update_instance(reference.type, reference.index)) {
      return false;
    }
  }

  // Rebuilt widgets are new LVGL children, so they sit on top until the
  // configured order is applied again.
  return apply_widget_z_order(next, dashboard);
}

void destroy(Dashboard& dashboard) {
  // Cleared under the LVGL lock for the same reason create() assembles the
  // table under it: the render trigger may be walking it.
  if (lvgl_port_lock(0)) {
    dashboard.widgets.clear();
    lvgl_port_unlock();
  }
  dashboard.display_diagnostics.destroy();
  dashboard.performance_overlay.destroy();
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
             const font_assets::Service& font_assets,
             const telemetry::ITelemetryRegistry& telemetry_registry,
             const telemetry::ITelemetryReader& telemetry,
             const transport::ITransport& telemetry_transport) {
  destroy(dashboard);
  return create(display, configuration, modules, dashboard, font_assets,
                telemetry_registry, telemetry, telemetry_transport);
}

}  // namespace simcore::dashboard_composition
