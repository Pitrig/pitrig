#pragma once

#include <array>

#include "dashboard_state.hpp"

namespace simcore::dashboard_composition {

// Every widget type's storage, in the order the composition registers them —
// slot and shape first, because a container's object has to exist before
// anything inside it resolves a parent. Both the full composition and the
// incremental apply walk this, which is why it is not private to either.
[[nodiscard]] inline std::array<WidgetStorage*, 8> storages(
    Dashboard& dashboard) {
  return {&dashboard.slot,  &dashboard.shape,     &dashboard.text,
          &dashboard.bar,   &dashboard.arc,       &dashboard.indicator,
          &dashboard.graph, &dashboard.image};
}

}  // namespace simcore::dashboard_composition
