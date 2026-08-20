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
constexpr std::uint32_t kMinimumStartupScreenDurationMs = 1'000;

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

// The modifier table the whole dashboard binds through. This is the one place
// a concrete module is named — the same role register_widget_types() plays for
// widget types — so the binders, the slots controller and every widget type
// resolve a modifier by its enum index and learn nothing about lap timing.
//
// A module that did not start leaves its entry empty, and an empty entry fails
// the bind rather than falling back to the raw telemetry the modifier was
// meant to replace.
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


// Assembles the descriptor table. Widget presence in the configuration decides
// which descriptors run; the manager itself knows nothing about either widget
// type. The table is assembled under the LVGL lock because the render trigger
// walks it under that lock from its own task.
[[nodiscard]] bool register_widget_types(Dashboard& dashboard) {
  if (!lvgl_port_lock(0)) {
    log::error(kTag, "Failed to lock LVGL for the widget table");
    return false;
  }
  dashboard.widgets.clear();
  // Slot first, then shape, and that is a correctness requirement rather than a
  // style choice. Both types can be parents, create_all() builds in this order
  // so every container exists before a child resolves it, and destroy_all()
  // walks it backwards so children delete their own objects before the container
  // that would otherwise take them down with it. Slot leads because a slot is
  // only ever authored on a screen while a shape may sit on one of its pages, so
  // this order is the one that satisfies both — which is why the parser refuses
  // a slot anywhere but a screen.
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
          widget_descriptor<ConditionWidgetOps<ImageWidgets>>(dashboard.image));
  lvgl_port_unlock();
  if (!registered) {
    log::error(kTag, "Failed to register dashboard widget types");
  }
  return registered;
}

// Slots and navigation are attached last, so a tap or a gesture can only arrive
// at screens that are fully built. A rebuilt dashboard has new screen objects,
// so this also returns to the first screen and to each slot's first loop page.
//
// Running after create_all() is also what keeps the slot clickable: every widget
// removes that flag as it builds, and this puts it back on the slots themselves.
[[nodiscard]] bool attach_slots_and_navigation(
    const configuration::ApplicationConfiguration& configuration,
    const dashboard::Layout& layout,
    const dashboard::frame::ModifierReaders& readers,
    Dashboard& dashboard, const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry) {
  if (!lvgl_port_lock(0)) {
    log::warn(kTag, "Failed to lock LVGL for slots and screen navigation");
    return true;
  }
  bool attached = true;
  for (std::size_t index = 0; index < configuration.dashboard.slot_widget_count;
       ++index) {
    const configuration::SlotWidgetConfiguration& config =
        configuration.dashboard.slot_widgets[index];
    lv_obj_t* const container =
        dashboard.slot.collection.root_object(index);
    const std::span<lv_obj_t* const> pages =
        std::span{dashboard.pages}
            .subspan(index * configuration::kMaximumSlotPages,
                     configuration::kMaximumSlotPages);
    if (container != nullptr &&
        !dashboard.slots.add(container, pages, config, registry, telemetry,
                             readers)) {
      log::error(kTag, "Failed to bind slot page source");
      attached = false;
    }
  }
  if (!dashboard.slots.start()) {
    log::error(kTag, "Failed to start dashboard slots");
    attached = false;
  }
  dashboard.navigation.attach(layout.screens);
  lvgl_port_unlock();
  return attached;
}

}  // namespace

Dashboard::Dashboard() = default;

// One display, one dashboard. Firmware-lifetime, like everything the
// composition root owns; it lives here so its type need not be public.
//
// It lives in external RAM: ~68 KB of widget-state pools whose per-frame
// working set is a few kilobytes and stays in the cache, and which internal
// RAM — the draw buffers' and LVGL's heap — is too short of on the ESP32-S3
// to hold. The one part that cannot be there is the render trigger's task
// stack and control block, which FreeRTOS requires internal, so those sit
// beside it in internal .bss.
EXT_RAM_BSS_ATTR Dashboard g_dashboard;
dashboard::render_trigger::Trigger::TaskStorage g_render_trigger_task;

Dashboard& instance() { return g_dashboard; }

bool show_startup_screen(
    lv_display_t* const display,
    const configuration::ApplicationConfiguration& configuration) {
  return dashboard::boot_splash::show(
      display, screens::screen_object(display, 0),
      kMinimumStartupScreenDurationMs,
      !screens::will_render_content(configuration));
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
  // The previous widgets are gone, so nothing points at a font any more:
  // release first, so a document that swaps every font is not refused for a
  // registry still full of the old ones.
  assets::release_unused_fonts(configuration, dashboard_state.fonts);
  if (!assets::acquire_fonts(configuration, dashboard_state.fonts)) {
    log::error(kTag, "One or more configured fonts could not be created");
    return false;
  }

  // The modifier readers every widget type binds through, and the same ones the
  // slots watch, so a modifier resolves identically wherever it is authored.
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
  // Measured once every widget stands, and before the z-order pass moves any of
  // them: what a container has to let through is a fact about the objects, not
  // about their stacking.
  if (initialized && !screens::apply_container_clipping(configuration,
                                                        dashboard_state)) {
    log::error(kTag, "Failed to apply container clipping");
    initialized = false;
  }
  if (!screens::apply_z_order(configuration, dashboard_state)) {
    log::error(kTag, "Failed to apply dashboard widget Z order");
    initialized = false;
  }
  if (!attach_slots_and_navigation(configuration, layout, readers,
                                   dashboard_state, telemetry_registry,
                                   telemetry)) {
    initialized = false;
  }
  // After attach(), which resets the controller and therefore the bindings.
  if (!screens::bind_actions(configuration, dashboard_state)) {
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
void destroy(Dashboard& dashboard) {
  // Cleared under the LVGL lock for the same reason create() assembles the
  // table under it: the render trigger may be walking it.
  if (lvgl_port_lock(0)) {
    dashboard.navigation.detach();
    dashboard.slots.clear();
    dashboard.widgets.clear();
    screens::release(dashboard);
    lvgl_port_unlock();
  }
  dashboard.performance_overlay.destroy();
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

}  // namespace simcore::dashboard_composition
