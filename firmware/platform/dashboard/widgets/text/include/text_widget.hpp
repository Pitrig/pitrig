#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"
#include "telemetry_registry.hpp"
#include "widget_frame.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;

namespace simcore::dashboard::fonts {
class Registry;
}

namespace simcore::dashboard::text_widget {

inline constexpr std::size_t kMaximumInstances =
    configuration::kMaximumTextWidgets;
inline constexpr std::size_t kMaximumSources =
    configuration::kMaximumTextSources;

struct WidgetBinding;

using ValueReadCallback = telemetry::TelemetryRead (*)(void* context);

using Alignment = configuration::TextAlignment;
using Config = configuration::TextWidgetConfiguration;

// Owns the fixed runtime state for every configured text widget. All instances
// share one render timer and consume only pre-bound value-pipeline callbacks.
class Collection final {
 public:
  Collection() = default;
  ~Collection();
  Collection(const Collection&) = delete;
  Collection& operator=(const Collection&) = delete;

  // `configurations` and `bindings` are parallel: element N of one describes
  // the widget element N of the other resolves values for.
  [[nodiscard]] bool create(
      const Layout& layout, std::span<const Config> configurations,
      std::span<const WidgetBinding> bindings, const fonts::Registry& fonts);
  [[nodiscard]] lv_obj_t* root_object(const std::size_t index) const {
    return index < count_ ? states_[index].container : nullptr;
  }
  void destroy();

  // Marks the shared render timer ready so the next LVGL pass re-reads every
  // source instead of waiting for the period to elapse. Caller holds the LVGL
  // lock. A no-op while no widgets exist.
  void wake();

  // Rebuilds one widget in place, leaving its siblings and the shared render
  // timer untouched. Used when a configuration replacement changed only this
  // widget. Returns false if the widget cannot be built, in which case its slot
  // is left empty rather than half-built.
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout,
                              const Config& configuration,
                              const WidgetBinding& binding,
                              const fonts::Registry& fonts);

 private:
  // One resolved source of a widget. Its text is rendered independently and
  // concatenated with its siblings, so a widget showing `P 3/24` holds two.
  struct Source {
    ValueReadCallback read{};
    void* read_context{};
    configuration::ValueTransform transform{};
    // Telemetry revision and availability last turned into displayed text.
    std::uint64_t rendered_revision{};
    bool rendered_available{};
    // Set for module modifiers, whose value derives from a free-running clock
    // and therefore carries no telemetry revision to compare against.
    bool free_running{};
  };

  struct State {
    std::array<Source, kMaximumSources> sources{};
    std::size_t source_count{};
    // Geometry, box, conditional colour, hiding and blink all belong to the
    // shared frame; what stays here is what makes this widget a text widget.
    frame::Painter painter{};
    lv_obj_t* container{};
    lv_obj_t* value_label{};
    std::array<char, telemetry::kTelemetryTextCapacity> unavailable_text{};
    std::array<char, telemetry::kTelemetryTextCapacity> displayed_text{};
    bool initialized{};
  };

  static void update(lv_timer_t* timer);
  void render();
  void render_state(State& state);
  void clear_objects();
  void release(State& state);
  [[nodiscard]] bool build(State& state, const Layout& layout,
                           const Config& configuration,
                           const WidgetBinding& binding,
                           const fonts::Registry& fonts);

  std::array<State, kMaximumInstances> states_{};
  std::size_t count_{};
  lv_timer_t* timer_{};
  bool created_{};
};

}  // namespace simcore::dashboard::text_widget
