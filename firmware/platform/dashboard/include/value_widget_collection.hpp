#pragma once

#include <cstddef>
#include <span>

#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "telemetry_types.hpp"
#include "widget_collection.hpp"
#include "widget_frame.hpp"

namespace pitrig::dashboard {

struct ValueUpdate {
  telemetry::TelemetryRead value{};
  bool first_render{};
  bool changed{};
};

template <typename State>
[[nodiscard]] ValueUpdate take_value(State& state) {
  const telemetry::TelemetryRead value = state.read(state.read_context);
  const bool first_render = !state.initialized;
  const ValueUpdate update{value, first_render,
                           first_render || state.free_running ||
                               value.revision != state.rendered_revision ||
                               value.available != state.rendered_available};
  state.rendered_revision = value.revision;
  state.rendered_available = value.available;
  return update;
}

template <typename Derived, typename State, std::size_t Capacity, typename Config>
class ValueWidgetCollection : public frame::Collection<Derived, State, Capacity> {
 public:
  [[nodiscard]] bool create(const Layout& layout, const std::span<const Config> configurations,
                            const std::span<const frame::ValueBinding> bindings,
                            const fonts::Registry& fonts) {
    if (layout.display == nullptr || configurations.size() != bindings.size()) {
      return false;
    }
    return this->build_all(bindings.size(), [&](State& state, const std::size_t index) {
      return bound(bindings[index]) &&
             self().build(state, layout, configurations[index], bindings[index], fonts);
    });
  }

  [[nodiscard]] bool recreate(const std::size_t index, const Layout& layout,
                              const Config& configuration, const frame::ValueBinding& binding,
                              const fonts::Registry& fonts) {
    if (!bound(binding)) {
      return false;
    }
    return this->rebuild_one(index, [&](State& state) {
      return self().build(state, layout, configuration, binding, fonts);
    });
  }

 private:
  [[nodiscard]] static bool bound(const frame::ValueBinding& binding) {
    return binding.read != nullptr && binding.read_context != nullptr;
  }

  [[nodiscard]] Derived& self() { return static_cast<Derived&>(*this); }
};

}
