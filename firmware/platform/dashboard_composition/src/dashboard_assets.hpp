#pragma once

#include "dashboard_fonts.hpp"

namespace simcore::configuration {
struct ApplicationConfiguration;
}

namespace simcore::dashboard_composition::assets {

// Creates and warms every font a configuration renders with, leaving whatever
// else the registry holds alone. Takes the LVGL lock itself. False when a font
// could not be created — a family that is not installed, or a registry that is
// full.
[[nodiscard]] bool acquire_fonts(
    const configuration::ApplicationConfiguration& configuration,
    dashboard::fonts::Registry& fonts);

// Destroys the fonts a configuration no longer references. Takes the LVGL lock
// itself. Only safe once no widget can still point at one of them: after the
// dashboard is torn down, or after every widget whose font changed has been
// rebuilt against the new document.
void release_unused_fonts(
    const configuration::ApplicationConfiguration& configuration,
    dashboard::fonts::Registry& fonts);

}  // namespace simcore::dashboard_composition::assets
