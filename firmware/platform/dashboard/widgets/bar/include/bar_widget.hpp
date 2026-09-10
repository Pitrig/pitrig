#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "lvgl_types.hpp"
#include "widget_collection.hpp"
#include "widget_frame.hpp"

namespace pitrig::dashboard::bar_widget {

inline constexpr std::size_t kMaximumInstances =
    configuration::kMaximumBarWidgets;

using Config = configuration::BarWidgetConfiguration;

struct State {
  frame::Painter painter{};
  frame::ValueReadCallback read{};
  void* read_context{};
  configuration::ValueRange range{};
  float origin_fraction{};
  configuration::BarOrientation orientation{};
  bool inverted{};
  bool free_running{};
  lv_obj_t* container{};
  lv_obj_t* fill{};
  std::int32_t inner_width{};
  std::int32_t inner_height{};
  std::int32_t origin_x{};
  std::int32_t origin_y{};
  std::uint32_t fill_rgb{};
  std::uint32_t grad_rgb{};
  bool gradient{};
  std::uint64_t rendered_revision{};
  bool rendered_available{};
  std::int32_t drawn_length{-1};
  std::int32_t drawn_offset{-1};
  bool initialized{};
};

class Collection final
    : public frame::Collection<Collection, State, kMaximumInstances> {
 public:
  [[nodiscard]] bool create(const Layout& layout,
                            std::span<const Config> configurations,
                            std::span<const frame::ValueBinding> bindings,
                            const fonts::Registry& fonts);
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout,
                              const Config& configuration,
                              const frame::ValueBinding& binding,
                              const fonts::Registry& fonts);

 private:
  friend frame::Collection<Collection, State, kMaximumInstances>;

  void render_state(State& state);
  [[nodiscard]] bool build(State& state, const Layout& layout,
                           const Config& configuration,
                           const frame::ValueBinding& binding,
                           const fonts::Registry& fonts);
};

}
