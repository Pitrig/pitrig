#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"
#include "telemetry_registry.hpp"

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
inline constexpr std::size_t kTitleCapacity =
    configuration::kWidgetTitleCapacity;
inline constexpr std::size_t kUnavailableTextCapacity =
    configuration::kUnavailableTextCapacity;

struct BoundConfig;

using ValueReadCallback = telemetry::TelemetryRead (*)(void* context);

using Alignment = configuration::TextAlignment;
using Border = configuration::WidgetBorder;
using TitleStyle = configuration::WidgetTitleStyle;
using ValueStyle = configuration::WidgetValueStyle;
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
      std::span<const BoundConfig> bindings, const fonts::Registry& fonts);
  [[nodiscard]] std::size_t size() const { return count_; }
  [[nodiscard]] lv_obj_t* root_object(const std::size_t index) const {
    return index < count_ ? states_[index].container : nullptr;
  }
  void destroy();

 private:
  struct State {
    ValueReadCallback read{};
    void* read_context{};
    configuration::ValueTransform transform{};
    lv_obj_t* container{};
    lv_obj_t* caption_gap{};
    lv_obj_t* caption{};
    lv_obj_t* value_label{};
    std::array<char, telemetry::kTelemetryTextCapacity> unavailable_text{};
    std::array<char, telemetry::kTelemetryTextCapacity> displayed_text{};
    // Telemetry revision and availability last turned into displayed text.
    std::uint64_t rendered_revision{};
    bool rendered_available{};
    // Set for module modifiers, whose value derives from a free-running clock
    // and therefore carries no telemetry revision to compare against.
    bool free_running{};
    bool initialized{};
  };

  static void update(lv_timer_t* timer);
  void render();
  void clear_objects();

  std::array<State, kMaximumInstances> states_{};
  std::size_t count_{};
  lv_timer_t* timer_{};
  bool created_{};
};

}  // namespace simcore::dashboard::text_widget
