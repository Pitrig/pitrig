#pragma once

#include "dashboard_fonts.hpp"
#include "delta_time_widget.hpp"
#include "display_diagnostics.hpp"
#include "performance_overlay_widget.hpp"
#include "text_widget.hpp"
#include "widget_binding.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::configuration {
struct ApplicationConfiguration;
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

struct Dashboard {
  dashboard::fonts::Registry fonts;
  dashboard::display_diagnostics::View display_diagnostics;
  dashboard::delta_time_widget::View delta_time_widget;
  dashboard::text_widget::Binder text_widget_binder;
  dashboard::text_widget::Collection text_widgets;
  dashboard::performance_overlay_widget::View performance_overlay;
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

}  // namespace simcore::dashboard_composition
