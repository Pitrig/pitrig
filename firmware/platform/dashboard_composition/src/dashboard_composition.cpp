#include "dashboard_composition.hpp"

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <span>

#include "application_configuration.hpp"
#include "boot_splash.hpp"
#include "dashboard_assets.hpp"
#include "dashboard_layout.hpp"
#include "dashboard_screens.hpp"
#include "display.hpp"
#include "logger.hpp"
#include "module_composition.hpp"
#include "simcore_features.hpp"
#include "telemetry_events.hpp"
#include "telemetry_registry.hpp"
#include "dashboard_state.hpp"
#include "dashboard_storages.hpp"
#include "widget_type_ops.hpp"
#include "esp_attr.h"
#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::dashboard_composition {
namespace {

constexpr char kTag[] = "dashboard";
constexpr std::uint32_t kMinimumStartupScreenDurationMs = 2'000;

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

[[nodiscard]] dashboard::frame::ModifierReaders modifier_readers(
    module_composition::Modules& modules) {
  dashboard::frame::ModifierReaders readers{};
  readers[static_cast<std::size_t>(
      configuration::ValueModifierType::lap_timer)] = {
      .read = modules.lap_timer_started ? &read_lap_timer_modifier : nullptr,
      .context = modules.lap_timer_started
                     ? static_cast<void*>(&modules.lap_timer)
                     : nullptr,
  };
  return readers;
}

void wake_widgets(void* const context) {
  static_cast<Dashboard*>(context)->widgets.wake_all();
}

void on_telemetry_updated(const events::Event&, void* const context) {
  if (display::rendering_in_progress()) {
    return;
  }
  static_cast<Dashboard*>(context)->render_trigger.request();
}


[[nodiscard]] bool register_widget_types(Dashboard& dashboard) {
  if (!lvgl_port_lock(0)) {
    log::error(kTag, "Failed to lock LVGL for the widget table");
    return false;
  }
  dashboard.widgets.clear();
  const bool registered =
      dashboard.widgets.add(
          widget_descriptor<SlotWidgetOps<SlotWidgets>>(dashboard.slot)) &&
      dashboard.widgets.add(
          widget_descriptor<ConditionWidgetOps<ShapeWidgets>>(
              dashboard.shape)) &&
      dashboard.widgets.add(
          widget_descriptor<ValueWidgetOps<TextWidgets>>(dashboard.text)) &&
      dashboard.widgets.add(
          widget_descriptor<ValueWidgetOps<BarWidgets>>(dashboard.bar)) &&
      dashboard.widgets.add(
          widget_descriptor<ValueWidgetOps<ArcWidgets>>(dashboard.arc)) &&
      dashboard.widgets.add(
          widget_descriptor<ValueWidgetOps<IndicatorWidgets>>(
              dashboard.indicator)) &&
      dashboard.widgets.add(
          widget_descriptor<ValueWidgetOps<GraphWidgets>>(dashboard.graph)) &&
      dashboard.widgets.add(
          widget_descriptor<ValueWidgetOps<ImageWidgets>>(dashboard.image));
  lvgl_port_unlock();
  if (!registered) {
    log::error(kTag, "Failed to register dashboard widget types");
  }
  return registered;
}

[[nodiscard]] bool attach_slots_and_navigation(
    const configuration::ApplicationConfiguration& configuration,
    const dashboard::Layout& layout, Dashboard& dashboard) {
  if (!lvgl_port_lock(0)) {
    log::warn(kTag, "Failed to lock LVGL for slots and screen navigation");
    return true;
  }
  const bool attached = screens::attach_slots(configuration, dashboard);
  dashboard.navigation.attach(layout.screens);
  dashboard.navigation.set_transition(configuration.dashboard.transition);
  lvgl_port_unlock();
  return attached;
}

}

Dashboard::Dashboard() = default;

EXT_RAM_BSS_ATTR Dashboard g_dashboard;
dashboard::render_trigger::Trigger::TaskStorage g_render_trigger_task;

Dashboard& instance() { return g_dashboard; }

bool show_startup_screen(
    lv_display_t* const display,
    const configuration::ApplicationConfiguration& configuration) {
  (void)configuration;
  return dashboard::boot_splash::show(display,
                                      lv_display_get_layer_top(display));
}

void dismiss_startup_screen(
    const configuration::ApplicationConfiguration& configuration,
    const bool wait_for_minimum) {
  if (!screens::will_render_content(configuration)) {
    return;
  }
  dashboard::boot_splash::dismiss(
      wait_for_minimum ? kMinimumStartupScreenDurationMs : 0);
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
  const std::size_t screen_count =
      screens::create(display, configuration, dashboard_state);
  if (screen_count == 0) {
    log::error(kTag, "Dashboard screen is unavailable");
    return false;
  }
  const dashboard::Layout layout{
      .display = display,
      .screens = std::span{dashboard_state.screens}.first(screen_count),
      .containers = dashboard_state.containers,
      .pages = dashboard_state.pages};
  assets::release_unused_fonts(configuration, dashboard_state.fonts);
  if (!assets::acquire_fonts(configuration, dashboard_state.fonts)) {
    log::error(kTag, "One or more configured fonts could not be created");
    return false;
  }

  const dashboard::frame::ModifierReaders readers = modifier_readers(modules);
  for (WidgetStorage* const storage : storages(dashboard_state)) {
    storage->layout = layout;
    storage->dashboard = &configuration.dashboard;
    storage->fonts = &dashboard_state.fonts;
    storage->registry = &telemetry_registry;
    storage->telemetry = &telemetry;
    storage->modifier_readers = readers;
  }
  dashboard_state.image.images = &dashboard_state.images;
  dashboard_state.shape.container_slots = dashboard_state.containers;
  dashboard_state.slot.page_slots = dashboard_state.pages;

  bool initialized = register_widget_types(dashboard_state);
  if (initialized && !dashboard_state.widgets.create_all()) {
    initialized = false;
  }
  if (initialized && !screens::apply_container_clipping(configuration,
                                                        dashboard_state)) {
    log::error(kTag, "Failed to apply container clipping");
    initialized = false;
  }
  if (!screens::apply_z_order(configuration, dashboard_state)) {
    log::error(kTag, "Failed to apply dashboard widget Z order");
    initialized = false;
  }
  if (!attach_slots_and_navigation(configuration, layout, dashboard_state)) {
    initialized = false;
  }
  if (!screens::bind_actions(configuration, dashboard_state)) {
    log::error(kTag, "Failed to bind dashboard tap actions");
    initialized = false;
  }

#if SIMCORE_DEBUG && SIMCORE_DEBUG_OVERLAY_FULL
  if (!dashboard_state.performance_overlay.create(display,
                                                  telemetry_transport)) {
    log::warn(kTag, "Failed to create performance overlay");
  }
#elif SIMCORE_DEBUG && SIMCORE_DEBUG_OVERLAY_FPS
  if (!dashboard_state.fps_overlay.create(display)) {
    log::warn(kTag, "Failed to create FPS overlay");
  }
  (void)telemetry_transport;
#else
  (void)telemetry_transport;
#endif
  return initialized;
}
void destroy(Dashboard& dashboard) {
  if (lvgl_port_lock(0)) {
    dashboard.navigation.detach();
    dashboard.slots.clear();
    dashboard.widgets.clear();
    screens::release(dashboard);
    lvgl_port_unlock();
  }
  dashboard.performance_overlay.destroy();
  dashboard.fps_overlay.destroy();
}

bool start_render_trigger(Dashboard& dashboard, events::EventBus& event_bus) {
  if (dashboard.render_trigger.started()) {
    return false;
  }
  if (!dashboard.render_trigger.start(&wake_widgets, &dashboard,
                                      g_render_trigger_task)) {
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

}
