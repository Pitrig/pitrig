#pragma once

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"

namespace simcore::delta_time {
class DeltaTime;
}

namespace simcore::dashboard::fonts {
class Registry;
}

namespace simcore::dashboard::delta_time_widget {

using ScaleStyle = configuration::DeltaTimeScaleStyle;
using Config = configuration::DeltaTimeWidgetConfiguration;

// Creates the display-independent Delta Time presentation state's LVGL view.
// Returns false when the display or configured geometry is invalid.
[[nodiscard]] bool create(const Layout& layout, const Config& config,
                          const delta_time::DeltaTime& module,
                          const fonts::Registry& fonts);

}  // namespace simcore::dashboard::delta_time_widget
