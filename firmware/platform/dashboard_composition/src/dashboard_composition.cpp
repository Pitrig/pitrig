#include "dashboard_composition.hpp"

#include <array>
#include <cstddef>
#include <cstdint>

#include "application_configuration.hpp"
#include "boot_splash.hpp"
#include "dashboard_layout.hpp"
#include "font_asset_service.hpp"
#include "logger.hpp"
#include "module_composition.hpp"
#include "simcore_features.hpp"
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
    // manager itself knows nothing about either widget type.
    dashboard_state.widgets.clear();
    const bool registered =
        dashboard_state.widgets.add({
            .type = configuration::WidgetType::text,
            .enabled = screen_configuration.text_widget_count > 0,
            .create = &create_text_widgets,
            .destroy = &destroy_text_widgets,
            .root_object = &text_widget_root,
            .context = &dashboard_state.text,
        }) &&
        dashboard_state.widgets.add({
            .type = configuration::WidgetType::delta_time,
            .enabled = screen_configuration.delta_time_widget_count > 0,
            .create = &create_delta_time_widget,
            .destroy = &destroy_delta_time_widget,
            .root_object = &delta_time_widget_root,
            .context = &dashboard_state.delta_time,
        });
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

void destroy(Dashboard& dashboard) {
  dashboard.widgets.clear();
  dashboard.display_diagnostics.destroy();
  dashboard.performance_overlay.destroy();
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
