#pragma once

#include <array>

#include "dashboard_state.hpp"

namespace simcore::dashboard_composition {

[[nodiscard]] inline std::array<WidgetStorage*, 8> storages(
    Dashboard& dashboard) {
  return {&dashboard.slot,  &dashboard.shape,     &dashboard.text,
          &dashboard.bar,   &dashboard.arc,       &dashboard.indicator,
          &dashboard.graph, &dashboard.image};
}

}
