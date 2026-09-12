#pragma once

#include "dashboard_fonts.hpp"

namespace pitrig::configuration {
struct ApplicationConfiguration;
}

namespace pitrig::dashboard_composition::assets {

[[nodiscard]] bool acquire_fonts(const configuration::ApplicationConfiguration& configuration,
                                 dashboard::fonts::Registry& fonts);

void release_unused_fonts(const configuration::ApplicationConfiguration& configuration,
                          dashboard::fonts::Registry& fonts);

}
