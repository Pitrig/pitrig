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

bool will_render_content(
    const configuration::ApplicationConfiguration& configuration) {
#if SIMCORE_DISPLAY_DIAGNOSTICS || SIMCORE_DEBUG
  (void)configuration;
  return true;
#else
  return configuration.dashboard.background_color != kDefaultBackgroundColor ||
         configuration.dashboard.delta_time_present ||
         configuration.dashboard.text_widget_count > 0;
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

struct WidgetLayer {
  lv_obj_t* object{};
  std::int16_t z_index{};
  std::uint8_t configuration_order{};
};

bool apply_widget_z_order(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard) {
  std::array<WidgetLayer, configuration::kMaximumTextWidgets + 1> layers{};
  std::size_t count{};
  if (configuration.dashboard.delta_time_present) {
    if (lv_obj_t* const object = dashboard.delta_time_widget.root_object();
        object != nullptr) {
      layers[count++] = {
          .object = object,
          .z_index = configuration.dashboard.delta_time.z_index,
          .configuration_order = 0,
      };
    }
  }
  for (std::size_t index = 0;
       index < configuration.dashboard.text_widget_count; ++index) {
    if (lv_obj_t* const object = dashboard.text_widgets.root_object(index);
        object != nullptr) {
      layers[count++] = {
          .object = object,
          .z_index = configuration.dashboard.text_widgets[index].z_index,
          .configuration_order = static_cast<std::uint8_t>(index + 1),
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
      display, kMinimumStartupScreenDurationMs,
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
  const dashboard::Layout layout{.display = display};
  if (!lvgl_port_lock(0)) {
    log::error(kTag, "Failed to lock LVGL for dashboard background");
    return false;
  }
  lv_obj_t* const screen = lv_display_get_screen_active(display);
  if (screen != nullptr) {
    lv_obj_set_style_bg_color(
        screen, lv_color_hex(configuration.dashboard.background_color),
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
          display, dashboard::display_diagnostics::Config{},
          dashboard_state.fonts)) {
    log::error(kTag, "Failed to start display diagnostics");
    initialized = false;
  }
#endif

  if (!diagnostics_enabled) {
    if (configuration.dashboard.delta_time_present) {
      if (!modules.delta_time_started) {
        log::error(kTag, "Delta Time widget dependency is unavailable");
        initialized = false;
      } else if (!dashboard_state.delta_time_widget.create(
                     layout, configuration.dashboard.delta_time,
                     modules.delta_time, dashboard_state.fonts)) {
        log::error(kTag, "Failed to create Delta Time widget");
        initialized = false;
      }
    }
    const std::span text_widgets{
        configuration.dashboard.text_widgets.data(),
        static_cast<std::size_t>(configuration.dashboard.text_widget_count)};
    if (!dashboard_state.text_widget_binder.bind(
            text_widgets, telemetry_registry, telemetry,
            {
                .read = modules.lap_timer_started
                            ? &read_lap_timer_modifier
                            : nullptr,
                .context = modules.lap_timer_started
                               ? static_cast<void*>(&modules.lap_timer)
                               : nullptr,
            })) {
      log::error(kTag, "Failed to resolve Text widget bindings");
      initialized = false;
    } else if (!dashboard_state.text_widgets.create(
                   layout, dashboard_state.text_widget_binder.bindings(),
                   dashboard_state.fonts)) {
      log::error(kTag, "Failed to create Text widgets");
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

}  // namespace simcore::dashboard_composition
