#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_images.hpp"
#include "dashboard_layout.hpp"
#include "widget_collection.hpp"
#include "widget_frame.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;

namespace simcore::dashboard::image_widget {

inline constexpr std::size_t kMaximumInstances =
    configuration::kMaximumImageWidgets;

using Config = configuration::ImageWidgetConfiguration;

// An uploaded image inside a frame. Drawing costs one LVGL object and no
// allocation; a rule's colour lands on the recolour, which is the only thing a
// bitmap can be tinted by.
//
// The descriptor is the widget's own copy of the registry's, because a sprite
// sheet's frames are reached by moving its data pointer and two widgets may sit
// on different frames of one sheet.
struct State {
  frame::Painter painter{};
  lv_obj_t* container{};
  lv_obj_t* image{};
  lv_image_dsc_t descriptor{};
  // Where the first frame starts and how far apart they are, so a frame change
  // is a pointer and an invalidate rather than anything LVGL has to work out.
  const std::uint8_t* frames{};
  std::size_t frame_stride{};
  std::size_t frame_count{1};
  // Absent on a plain image, and on a sheet whose frame is authored outright.
  frame::ValueReadCallback frame_read{};
  void* frame_context{};
  std::size_t rendered_frame{};
  std::uint64_t rendered_revision{};
  bool initialized{};
  // What a rule's colour lands as, and what it has to be put back to. A tint is
  // invisible while its opacity is zero, which is what an image with no
  // authored `recolor` carries, so a rule has to raise the opacity as well as
  // set the colour — and reverting has to lower it again.
  std::uint32_t authored_color{};
  std::uint8_t authored_opa{};
  std::uint8_t rule_opa{};
};

// What an image watches: the sprite frame source, and the source its styling
// rules use. Both are optional, which is why neither shared binder fits — one
// insists on a value source every widget of the type must carry, and the other
// has room only for the rules'.
class Binder final {
 public:
  [[nodiscard]] bool bind(std::span<const Config> configurations,
                          const telemetry::ITelemetryRegistry& registry,
                          const telemetry::ITelemetryReader& telemetry,
                          const frame::ModifierReaders& modifier_readers);

  [[nodiscard]] std::span<const frame::ValueBinding> bindings() const {
    return {bindings_.data(), count_};
  }

 private:
  std::array<frame::SourceContext, kMaximumInstances> frame_contexts_{};
  std::array<frame::SourceContext, kMaximumInstances> condition_contexts_{};
  std::array<frame::ValueBinding, kMaximumInstances> bindings_{};
  std::size_t count_{};
};

class Collection final
    : public frame::Collection<Collection, State, kMaximumInstances> {
 public:
  [[nodiscard]] bool create(const Layout& layout,
                            std::span<const Config> configurations,
                            std::span<const frame::ValueBinding> bindings,
                            const fonts::Registry& fonts,
                            const images::Registry& images);
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout,
                              const Config& configuration,
                              const frame::ValueBinding& binding,
                              const fonts::Registry& fonts,
                              const images::Registry& images);

 private:
  friend frame::Collection<Collection, State, kMaximumInstances>;

  [[nodiscard]] bool build(State& state, const Layout& layout,
                           const Config& configuration,
                           const frame::ValueBinding& binding,
                           const fonts::Registry& fonts,
                           const images::Registry& images);
  void render_state(State& state);
};

}  // namespace simcore::dashboard::image_widget
