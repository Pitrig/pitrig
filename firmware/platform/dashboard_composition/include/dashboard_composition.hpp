#pragma once

#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "delta_time_widget.hpp"
#include "display_diagnostics.hpp"
#include "performance_overlay_widget.hpp"
#include "text_widget.hpp"
#include "widget_binding.hpp"
#include "widget_descriptor.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::configuration {
struct ApplicationConfiguration;
struct ScreenConfiguration;
}
namespace simcore::delta_time {
class DeltaTime;
}
namespace simcore::font_assets {
class Service;
}
namespace simcore::module_composition {
struct Modules;
}
namespace simcore::telemetry {
class ITelemetryReader;
class ITelemetryRegistry;
}
namespace simcore::transport {
class ITransport;
}

namespace simcore::dashboard_composition {

// Per-type widget storage plus the inputs its creation needs. One of these is
// the `context` its WidgetDescriptor carries, so the manager stays free of
// widget-specific knowledge.

struct TextWidgets {
  dashboard::text_widget::Binder binder;
  dashboard::text_widget::Collection collection;
  dashboard::Layout layout{};
  const configuration::ScreenConfiguration* screen{};
  const dashboard::fonts::Registry* fonts{};
  const telemetry::ITelemetryRegistry* registry{};
  const telemetry::ITelemetryReader* telemetry{};
  dashboard::text_widget::ModifierReader lap_timer_modifier{};
};

struct DeltaTimeWidgets {
  dashboard::delta_time_widget::View view;
  dashboard::Layout layout{};
  const configuration::ScreenConfiguration* screen{};
  const dashboard::fonts::Registry* fonts{};
  const delta_time::DeltaTime* module{};
};

struct Dashboard {
  dashboard::fonts::Registry fonts;
  dashboard::display_diagnostics::View display_diagnostics;
  dashboard::performance_overlay_widget::View performance_overlay;
  dashboard::WidgetManager widgets;
  TextWidgets text;
  DeltaTimeWidgets delta_time;
};

[[nodiscard]] bool show_startup_screen(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration);

[[nodiscard]] bool create(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration,
    module_composition::Modules& modules, Dashboard& dashboard,
    const font_assets::Service& font_assets,
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const transport::ITransport& telemetry_transport);

// Releases every LVGL object and timer the dashboard owns. The loaded font
// registry is kept: font assets are installed once per boot.
void destroy(Dashboard& dashboard);

// Tears the dashboard down and composes it again from a configuration document
// that may differ from the one it was built with. Nothing calls this yet; it
// exists so applying a configuration without a restart is a call rather than a
// restructuring. Must run on a task that may take the LVGL lock, and the
// supplied configuration must remain the active one for the call's duration.
[[nodiscard]] bool rebuild(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration,
    module_composition::Modules& modules, Dashboard& dashboard,
    const font_assets::Service& font_assets,
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const transport::ITransport& telemetry_transport);

}  // namespace simcore::dashboard_composition
