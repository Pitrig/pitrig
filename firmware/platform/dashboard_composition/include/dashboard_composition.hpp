#pragma once

#include <cstdint>
#include <span>

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::configuration {
struct ApplicationConfiguration;
struct DashboardConfiguration;
}
namespace simcore::font_assets {
class Service;
}
namespace simcore::image_assets {
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
namespace simcore::events {
class EventBus;
}

namespace simcore::dashboard_composition {

// The dashboard is opaque here on purpose. Its storage holds every widget
// type's pool and the LVGL objects behind them; a composition root that could
// see that would link against LVGL and against each widget type's ABI, and
// would be recompiled whenever either changed. It owns one instance, because
// there is one display.
struct Dashboard;

// The dashboard this firmware runs. Statically allocated, like everything else
// the composition root owns — placed here rather than there so its type stays
// private.
[[nodiscard]] Dashboard& instance();

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

// Copies every uploaded image into caller-owned external memory, for the same
// reason the faces are copied: the next upload releases the package mapping
// while the dashboard is still drawing from it. `storage` must be at least
// `image_assets.image_bytes_total()` bytes.
[[nodiscard]] bool load_images(Dashboard& dashboard,
                               const image_assets::Service& image_assets,
                               std::span<std::uint8_t> storage);

// Whether every image a configuration names is installed. Checked before a
// replacement is applied, so a document that references a missing image is
// rejected while the running dashboard is still intact.
[[nodiscard]] bool images_available(
    const configuration::ApplicationConfiguration& configuration,
    const Dashboard& dashboard);

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
    const Dashboard& dashboard);

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

}  // namespace simcore::dashboard_composition
