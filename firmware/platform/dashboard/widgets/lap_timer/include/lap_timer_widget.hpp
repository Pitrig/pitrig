#pragma once

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"

namespace simcore::lap_timer {
class LapTimer;
}

namespace simcore::dashboard::fonts {
class Registry;
}

namespace simcore::dashboard::lap_timer_widget {

using Config = configuration::LapTimerWidgetConfiguration;

// Creates the lap timer label and its periodic render callback.
[[nodiscard]] bool create(const Layout& layout, const Config& config,
                          lap_timer::LapTimer& module,
                          const fonts::Registry& fonts);

}  // namespace simcore::dashboard::lap_timer_widget
