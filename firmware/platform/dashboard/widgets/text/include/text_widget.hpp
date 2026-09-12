#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"
#include "lvgl_types.hpp"
#include "telemetry_registry.hpp"
#include "widget_collection.hpp"
#include "widget_frame.hpp"

namespace pitrig::dashboard::fonts {
class Registry;
}

namespace pitrig::telemetry {
class ITelemetryReader;
}

namespace pitrig::dashboard::text_widget {

inline constexpr std::size_t kMaximumInstances = configuration::kMaximumTextWidgets;
inline constexpr std::size_t kMaximumSources = configuration::kMaximumTextSources;

struct WidgetBinding;

using ValueReadCallback = telemetry::TelemetryRead (*)(void* context);

using Alignment = configuration::TextAlignment;
using Config = configuration::TextWidgetConfiguration;

struct Source {
  ValueReadCallback read{};
  void* read_context{};
  configuration::ValueTransform transform{};
  std::uint64_t rendered_revision{};
  bool rendered_available{};
  bool free_running{};
};

struct State {
  std::array<Source, kMaximumSources> sources{};
  std::size_t source_count{};
  frame::Painter painter{};
  const telemetry::ITelemetryReader* telemetry{};
  lv_obj_t* container{};
  const lv_font_t* font{};
  std::array<char, telemetry::kTelemetryTextCapacity> unavailable_text{};
  std::array<char, telemetry::kTelemetryTextCapacity> displayed_text{};
  std::uint32_t color{};
  Alignment alignment{};
  std::int32_t value_height{};
  std::int32_t text_width{};
  std::int32_t offset_y{};
  bool full_width{};
  bool initialized{};
  bool rendered_started{};
};

class Collection final : public frame::Collection<Collection, State, kMaximumInstances> {
 public:
  [[nodiscard]] bool create(const Layout& layout, std::span<const Config> configurations,
                            std::span<const WidgetBinding> bindings, const fonts::Registry& fonts);
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout, const Config& configuration,
                              const WidgetBinding& binding, const fonts::Registry& fonts);

 private:
  friend frame::Collection<Collection, State, kMaximumInstances>;

  void render_state(State& state);
  [[nodiscard]] bool build(State& state, const Layout& layout, const Config& configuration,
                           const WidgetBinding& binding, const fonts::Registry& fonts);
};

}
