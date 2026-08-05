#pragma once

#include "dashboard_fonts.hpp"
#include "delta_time.hpp"
#include "lap_timer.hpp"
#include "module_manager.hpp"
#include "text_widget.hpp"
#include "widget_binding.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::configuration {
struct ApplicationConfiguration;
}

namespace simcore::events {
class EventBus;
}

namespace simcore::font_assets {
class Service;
}

namespace simcore::telemetry {
class ITelemetryReader;
class ITelemetryRegistry;
}

namespace simcore::transport {
class ITransport;
}

namespace simcore::runtime_composition {

// Owns the fixed set of feature modules selected for this application.
struct Modules {
  struct LapTimerBinding {
    lap_timer::LapTimer* module{};
    events::EventBus* event_bus{};
    const telemetry::ITelemetryReader* telemetry{};
    telemetry::Handle handle{};
    const lap_timer::Config* configuration{};
    bool* started{};
  };

  struct DeltaTimeBinding {
    delta_time::DeltaTime* module{};
    events::EventBus* event_bus{};
    const telemetry::ITelemetryReader* telemetry{};
    telemetry::Handle handle{};
    const delta_time::Config* configuration{};
    bool* started{};
  };

  lap_timer::LapTimer lap_timer;
  delta_time::DeltaTime delta_time;
  LapTimerBinding lap_timer_binding{};
  DeltaTimeBinding delta_time_binding{};
  bool lap_timer_started{};
  bool delta_time_started{};
  // Declared last so it stops modules before their storage is destroyed.
  modules::Manager manager;
};

struct Dashboard {
  dashboard::fonts::Registry fonts;
  dashboard::text_widget::Binder text_widget_binder;
  dashboard::text_widget::Collection text_widgets;
};

// Shows the native startup asset selected by logical display resolution.
[[nodiscard]] bool show_startup_screen(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration);

// Starts every configured feature module against shared platform services.
[[nodiscard]] bool start_modules(
    Modules& modules, events::EventBus& event_bus,
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const configuration::ApplicationConfiguration& configuration);

// Creates the configured platform dashboard and its widget composition.
[[nodiscard]] bool create_dashboard(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration,
    Modules& modules, Dashboard& dashboard_state,
    const font_assets::Service& font_assets,
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const transport::ITransport& telemetry_transport);

}  // namespace simcore::runtime_composition
