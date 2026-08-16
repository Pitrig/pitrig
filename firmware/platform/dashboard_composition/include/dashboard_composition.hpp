#pragma once

#include <cstdint>
#include <span>

#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "delta_time_widget.hpp"
#include "event_bus.hpp"
#include "performance_overlay_widget.hpp"
#include "render_trigger.hpp"
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
  dashboard::performance_overlay_widget::View performance_overlay;
  dashboard::WidgetManager widgets;
  TextWidgets text;
  DeltaTimeWidgets delta_time;
  // Firmware-lifetime: survives destroy()/create() cycles, which only replace
  // the widgets it wakes.
  dashboard::render_trigger::Trigger render_trigger;
  events::Subscription telemetry_subscription{};
};

[[nodiscard]] bool show_startup_screen(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration);

// Copies every uploaded font face into caller-owned external memory. A
// rasterizer reads the face on every glyph cache miss, while the next upload
// releases the package mapping with the dashboard still running, so the copy is
// what keeps live fonts valid. Call once after the display exists and before
// the first create(); `storage` must be at least
// `font_assets.face_bytes_total()` bytes.
[[nodiscard]] bool load_fonts(Dashboard& dashboard,
                              const font_assets::Service& font_assets,
                              std::span<std::uint8_t> storage);

// Starts event-driven rendering: every telemetry update wakes the widget render
// timers through the render trigger, so a changed value is drawn on the next
// LVGL pass instead of the next timer period. Call once after the first
// create(); the periodic timers keep working as a fallback if this fails.
[[nodiscard]] bool start_render_trigger(Dashboard& dashboard,
                                        events::EventBus& event_bus);

[[nodiscard]] bool create(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration,
    module_composition::Modules& modules, Dashboard& dashboard,
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const transport::ITransport& telemetry_transport);

// Reports whether every font family the configuration references is installed.
// Faces are installed once per boot, so a configuration naming a new family
// cannot be composed until the device restarts; a new pixel size of an
// installed family needs neither an upload nor a restart. Checking before
// tearing the dashboard down keeps a rejected replacement from leaving a blank
// screen.
[[nodiscard]] bool fonts_available(
    const configuration::ApplicationConfiguration& configuration,
    const dashboard::fonts::Registry& fonts);

// Applies a replacement that differs from the running document only in widget
// properties or the screen background, rebuilding just the widgets that
// changed. Returns false when the difference is structural — a different widget
// set, order, or screen count — and the caller must recompose fully.
//
// `previous` is the document the dashboard was built from and `next` the one now
// active, so this runs after promotion.
[[nodiscard]] bool apply_incremental(
    const configuration::ApplicationConfiguration& previous,
    const configuration::ApplicationConfiguration& next,
    Dashboard& dashboard);

// Releases every LVGL object and timer the dashboard owns. The loaded faces are
// kept: they are installed once per boot. Font objects are kept too; the next
// create() destroys the ones its configuration no longer references.
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
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const transport::ITransport& telemetry_transport);

}  // namespace simcore::dashboard_composition
