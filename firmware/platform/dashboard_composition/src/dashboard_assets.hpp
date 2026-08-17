#pragma once

#include "dashboard_fonts.hpp"

namespace simcore::configuration {
struct ApplicationConfiguration;
}

namespace simcore::dashboard_composition::assets {

// Creates the fonts a configuration renders with and drops the ones it no
// longer needs. Runs with the previous widgets already destroyed, so no label
// can be pointing at a font object being released.
[[nodiscard]] bool prepare_fonts(
    const configuration::ApplicationConfiguration& configuration,
    dashboard::fonts::Registry& fonts);

}  // namespace simcore::dashboard_composition::assets
