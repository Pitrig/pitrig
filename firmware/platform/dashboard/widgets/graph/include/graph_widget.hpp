#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "lvgl.h"
#include "lvgl_types.hpp"
#include "widget_collection.hpp"
#include "widget_frame.hpp"

namespace pitrig::dashboard::graph_widget {

inline constexpr std::size_t kMaximumInstances = configuration::kMaximumGraphWidgets;
inline constexpr std::size_t kMaximumPoints = configuration::kMaximumGraphPoints;
inline constexpr std::size_t kMaximumSources = configuration::kMaximumGraphSources;

static_assert(kMaximumSources == configuration::kMaximumGraphTraces + 1);

using Config = configuration::GraphWidgetConfiguration;

struct WidgetBinding;

inline constexpr std::size_t kPendingSamples = 8;

struct Trace {
  frame::ValueReadCallback read{};
  void* read_context{};
  configuration::ValueRange range{};
  std::uint32_t color{};
  float previous_y{};
  bool has_previous{};
};

struct State {
  frame::Painter painter{};
  lv_obj_t* container{};
  lv_obj_t* canvas{};
  std::array<Trace, kMaximumSources> traces{};
  std::size_t trace_count{};
  std::uint16_t sample_interval_ms{};
  std::uint16_t line_width_px{};
  std::uint32_t last_sample_tick{};
  std::uint32_t override_rgb{};
  std::uint32_t background_rgb{};
  std::int32_t plot_width{};
  std::int32_t plot_height{};
  std::int32_t line_inset{};
  std::int32_t head_x{};
  float step_px{};
  float step_carry{};
  bool initialized{};
  std::array<std::array<std::int16_t, kMaximumSources>, kPendingSamples> pending{};
  std::atomic<std::uint8_t> pending_write{};
  std::atomic<std::uint8_t> pending_read{};
};

class Collection final : public frame::Collection<Collection, State, kMaximumInstances> {
 public:
  using Base = frame::Collection<Collection, State, kMaximumInstances>;

  ~Collection();

  [[nodiscard]] bool create(const Layout& layout, std::span<const Config> configurations,
                            std::span<const WidgetBinding> bindings, const fonts::Registry& fonts);
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout, const Config& configuration,
                              const WidgetBinding& binding, const fonts::Registry& fonts);
  [[nodiscard]] bool extend_to(std::size_t count);
  [[nodiscard]] bool shrink_to(std::size_t count);
  void destroy();
  void sample_all();
  static void sample_task(void* context);

 private:
  friend Base;

  void render_state(State& state);
  void on_released(std::size_t index);
  void start_sampling();
  void stop_sampling();
  static void sample_state(State& state);
  static void draw_sample(State& state, lv_layer_t& layer, std::span<const std::int16_t> sample);
  [[nodiscard]] bool build(State& state, const Layout& layout, const Config& configuration,
                           const WidgetBinding& binding, const fonts::Registry& fonts);

  std::atomic<std::uint32_t> sampler_period_ms_{};
};

}
