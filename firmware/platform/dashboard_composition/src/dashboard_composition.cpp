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
#include "widget_type_ops.hpp"
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

// Every type's storage, in the order the descriptors are registered. Anything
// that treats the storage uniformly — wiring a document in, repointing it after
// a promotion — walks this rather than naming the eight members.
std::array<WidgetStorage*, 8> storages(Dashboard& dashboard) {
  return {&dashboard.slot,  &dashboard.shape,     &dashboard.text,
          &dashboard.bar,   &dashboard.arc,       &dashboard.indicator,
          &dashboard.graph, &dashboard.image};
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
    const dashboard::frame::ModifierReader lap_timer_modifier,
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
                             lap_timer_modifier)) {
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

// Whether this widget's caption mask takes its colour from one of the screens
// in `recoloured`, and so has to be rebuilt for that colour to reach it. The
// rule for which masks read the parent belongs to the frame that builds them.
[[nodiscard]] bool caption_masks_screen(
    const configuration::WidgetFrame* const frame,
    const std::uint32_t recoloured) {
  if (frame == nullptr || frame->title.text.front() == '\0' ||
      frame->border.width_px == 0 ||
      !dashboard::frame::caption_mask_reads_parent(*frame)) {
    return false;
  }
  return (recoloured & (1U << frame->screen_index)) != 0;
}

}  // namespace

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
  if (!assets::prepare_fonts(configuration, dashboard_state.fonts)) {
    log::error(kTag, "One or more configured fonts could not be created");
    return false;
  }

  // The module reader every widget type binds through, and the same one the
  // slots watch, so a lap-timer modifier resolves identically wherever it is
  // authored.
  const dashboard::frame::ModifierReader lap_timer_modifier{
      .read = modules.lap_timer_started ? &read_lap_timer_modifier : nullptr,
      .context = modules.lap_timer_started
                     ? static_cast<void*>(&modules.lap_timer)
                     : nullptr,
  };
  for (WidgetStorage* const storage : storages(dashboard_state)) {
    storage->layout = layout;
    storage->dashboard = &configuration.dashboard;
    storage->fonts = &dashboard_state.fonts;
    storage->registry = &telemetry_registry;
    storage->telemetry = &telemetry;
    storage->lap_timer_modifier = lap_timer_modifier;
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
  if (initialized && !screens::unclip_containers(configuration,
                                                 dashboard_state)) {
    log::error(kTag, "Failed to release container clipping");
    initialized = false;
  }
  if (!screens::apply_z_order(configuration, dashboard_state)) {
    log::error(kTag, "Failed to apply dashboard widget Z order");
    initialized = false;
  }
  if (!attach_slots_and_navigation(configuration, layout,
                                   lap_timer_modifier, dashboard_state,
                                   telemetry_registry, telemetry)) {
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

bool apply_incremental(
    const configuration::ApplicationConfiguration& previous,
    const configuration::ApplicationConfiguration& next, Dashboard& dashboard) {
  const configuration::DashboardConfiguration& before = previous.dashboard;
  const configuration::DashboardConfiguration& after = next.dashboard;

  // A different widget set, order, or storage layout is structural: a screen's
  // reference table carries type, storage index, and the z_index ordering key,
  // so equal tables mean compositing cannot have changed either.
  if (before.screen_count != after.screen_count) {
    return false;
  }
  for (const configuration::WidgetTypeTraits& traits :
       configuration::kWidgetTypeTraits) {
    if (traits.count(before) != traits.count(after)) {
      return false;
    }
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
  }

  // Every tap target is unbound now, while the objects it was bound to still
  // exist; the rebuild below replaces some of them, and the pass at the end
  // binds onto whatever the document has after that.
  if (!lvgl_port_lock(0)) {
    return false;
  }
  dashboard.navigation.clear_actions();
  lvgl_port_unlock();

  // Widget contexts point into the document that was active when they were
  // built. Promotion swapped that out, so repoint them before rebuilding.
  for (WidgetStorage* const storage : storages(dashboard)) {
    storage->dashboard = &after;
  }

  // One bit per screen, and a document holds at most kMaximumScreens of them.
  std::uint32_t recoloured_screens = 0;
  static_assert(configuration::kMaximumScreens <= 32,
                "The recoloured-screen set is one bit per screen");
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
    recoloured_screens |= 1U << index;
  }

  // Walking the pool rather than the reference tables compares each widget
  // once, whatever screen it belongs to, and cannot pair an index with the
  // wrong type's storage. Widget configurations are trivially copyable
  // aggregates, so a byte compare is an exact change test: padding can only
  // produce a false "changed", costing one extra rebuild, never a false
  // "unchanged".
  for (const configuration::WidgetTypeTraits& traits :
       configuration::kWidgetTypeTraits) {
    const std::uint8_t count = traits.count(after);
    for (std::uint8_t index = 0; index < count; ++index) {
      const std::span<const std::byte> left = traits.element_bytes(before, index);
      const std::span<const std::byte> right = traits.element_bytes(after, index);
      const bool changed =
          left.size() != right.size() ||
          std::memcmp(left.data(), right.data(), left.size()) != 0;
      // A caption mask resolves the colour behind the widget when the widget is
      // built, so a screen that changes colour leaves every mask standing on it
      // holding the old one. The widget's own bytes did not change, so the
      // compare above cannot see it; rebuilding is what re-runs the resolution.
      if (!changed &&
          !caption_masks_screen(traits.frame(after, index), recoloured_screens)) {
        continue;
      }
      // Rebuilding a container deletes its LVGL object, and LVGL takes the
      // descendants with it — children owned by other collections, and the slot
      // controller's pointers to the pages. Those are structural, so a shape
      // that holds children goes the full-recomposition route. The test is its
      // role rather than what changed: a colour edit trips the byte compare
      // above just the same, and would delete the children just the same. A
      // plain backing plate, which is most shapes, keeps the fast path. A slot
      // is always a container, and its own update_instance refuses outright.
      if (traits.type == configuration::WidgetType::shape &&
          after.shape_widgets[index].widget_count > 0) {
        return false;
      }
      if (!dashboard.widgets.update_instance(traits.type, index)) {
        return false;
      }
    }
  }

  // What a container has to let through is a fact about where its children
  // ended up, so moving or resizing one changes it — and that is exactly the
  // edit this path takes. Without re-measuring, the overflow stays whatever the
  // last full composition saw, and LVGL clips a widget dragged past its
  // container's edge to a box that no longer describes it.
  if (!screens::unclip_containers(next, dashboard)) {
    return false;
  }
  // Rebuilt widgets are new LVGL children, so they sit on top until the
  // configured order is applied again — and they are new objects, so their tap
  // actions have to be bound onto them again.
  return screens::apply_z_order(next, dashboard) &&
         screens::bind_actions(next, dashboard);
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

}  // namespace simcore::dashboard_composition
