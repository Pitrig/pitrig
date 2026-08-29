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

struct Dashboard;

[[nodiscard]] Dashboard& instance();

[[nodiscard]] bool show_startup_screen(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration);

void dismiss_startup_screen(
    const configuration::ApplicationConfiguration& configuration,
    bool wait_for_minimum);

[[nodiscard]] bool load_fonts(Dashboard& dashboard,
                              const font_assets::Service& font_assets,
                              std::span<std::uint8_t> storage);

[[nodiscard]] std::size_t image_bytes_required(
    const configuration::ApplicationConfiguration& configuration,
    const image_assets::Service& image_assets);

[[nodiscard]] bool load_images(
    Dashboard& dashboard,
    const configuration::ApplicationConfiguration& configuration,
    const image_assets::Service& image_assets, std::span<std::uint8_t> storage);

[[nodiscard]] bool images_available(
    const configuration::ApplicationConfiguration& configuration,
    const image_assets::Service& image_assets, const Dashboard& dashboard);

[[nodiscard]] bool images_loaded(
    const configuration::ApplicationConfiguration& configuration,
    const Dashboard& dashboard);

[[nodiscard]] bool start_render_trigger(Dashboard& dashboard,
                                        events::EventBus& event_bus);

[[nodiscard]] bool create(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration,
    module_composition::Modules& modules, Dashboard& dashboard,
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const transport::ITransport& telemetry_transport);

[[nodiscard]] bool fonts_available(
    const configuration::ApplicationConfiguration& configuration,
    const Dashboard& dashboard);

[[nodiscard]] bool apply_incremental(
    const configuration::ApplicationConfiguration& previous,
    const configuration::ApplicationConfiguration& next,
    Dashboard& dashboard);

void destroy(Dashboard& dashboard);

}
