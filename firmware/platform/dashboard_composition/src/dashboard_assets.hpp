#pragma once

#include "dashboard_fonts.hpp"

namespace simcore::configuration {
struct ApplicationConfiguration;
}

namespace simcore::dashboard_composition::assets {

[[nodiscard]] bool acquire_fonts(
    const configuration::ApplicationConfiguration& configuration,
    dashboard::fonts::Registry& fonts);

void release_unused_fonts(
    const configuration::ApplicationConfiguration& configuration,
    dashboard::fonts::Registry& fonts);

}
