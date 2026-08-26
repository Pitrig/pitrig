#pragma once

#include <algorithm>
#include <bitset>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <span>

#include "application_configuration.hpp"
#include "widget_frame.hpp"

// The change-detection rules of the incremental apply pass: which pool slots a
// replacement really touched, and which unchanged widgets must still be rebuilt
// because something they resolved at build time — the colour behind a caption
// mask — was repainted under them. The pass that acts on these answers lives in
// dashboard_incremental.cpp.
namespace simcore::dashboard_composition::incremental {

// Whether this widget's caption mask takes its colour from whatever it is
// standing on, rather than from the widget's own fill. The rule for which masks
// read the parent belongs to the frame that builds them; what such a mask is
// standing on is either its screen or the container it was authored in.
[[nodiscard]] inline bool caption_masks_parent(
    const configuration::WidgetFrame* const frame) {
  return frame != nullptr && frame->title.text.front() != '\0' &&
         frame->border.width_px != 0 &&
         dashboard::frame::caption_mask_reads_parent(*frame);
}

// A mask resolves what is behind the widget when the widget is built, so
// anything that repaints behind it leaves the mask holding the old colour. The
// widget's own bytes did not change, so the compare cannot see it; rebuilding is
// what re-runs the resolution.
[[nodiscard]] inline bool caption_masks_screen(
    const configuration::WidgetFrame* const frame,
    const std::uint32_t recoloured) {
  return caption_masks_parent(frame) &&
         (recoloured & (1U << frame->screen_index)) != 0;
}

// One bit per shape pool slot. A bitset rather than an integer mask because the
// pool is a contract value: an integer silently stops covering it the day the
// cap passes its width, and the widget it stopped covering is one whose caption
// keeps the colour of a container that was repainted behind it.
using ContainerSet = std::bitset<configuration::kMaximumShapeWidgets>;

[[nodiscard]] inline bool caption_masks_container(
    const configuration::WidgetFrame* const frame,
    const ContainerSet& repainted) {
  return caption_masks_parent(frame) &&
         frame->parent_kind == configuration::WidgetParentKind::shape &&
         frame->parent_index < repainted.size() &&
         repainted.test(frame->parent_index);
}

// A type whose objects are the LVGL parents of other widgets. What makes these
// two special everywhere in this pass: they are updated before what they hold
// and released after it.
[[nodiscard]] inline bool is_container(const configuration::WidgetType type) {
  return type == configuration::WidgetType::shape ||
         type == configuration::WidgetType::slot;
}

// The containers whose paint changed, one bit per pool index. Only the fields a
// mask actually reads count: it copies the container's background colour, and an
// inset background moves the paint off the container altogether. A container
// this replacement added is not here — everything inside it is new too.
[[nodiscard]] inline ContainerSet repainted_containers(
    const configuration::DashboardConfiguration& before,
    const configuration::DashboardConfiguration& after) {
  ContainerSet repainted{};
  const std::uint8_t common =
      std::min(before.shape_widget_count, after.shape_widget_count);
  for (std::uint8_t index = 0; index < common; ++index) {
    const configuration::WidgetFrame& was = before.shape_widgets[index].frame;
    const configuration::WidgetFrame& now = after.shape_widgets[index].frame;
    if (was.background_color != now.background_color ||
        was.background_inset_px != now.background_inset_px) {
      repainted.set(index);
    }
  }
  return repainted;
}

// Whether one pool slot has to be brought up to the replacement. A slot past
// what the previous document held is a widget this replacement added, and it is
// reserved empty: building it is the same call that rebuilds a changed one.
//
// Widget configurations are trivially copyable aggregates, so a byte compare is
// an exact change test: padding can only produce a false "changed", costing one
// extra rebuild, never a false "unchanged".
[[nodiscard]] inline bool needs_update(const configuration::WidgetTypeTraits& traits,
                                const configuration::DashboardConfiguration& before,
                                const configuration::DashboardConfiguration& after,
                                const std::uint8_t index,
                                const std::uint8_t previous_count,
                                const std::uint32_t recoloured_screens,
                                const ContainerSet& repainted) {
  if (index >= previous_count) {
    return true;
  }
  const std::span<const std::byte> left = traits.element_bytes(before, index);
  const std::span<const std::byte> right = traits.element_bytes(after, index);
  if (left.size() != right.size() ||
      std::memcmp(left.data(), right.data(), left.size()) != 0) {
    return true;
  }
  const configuration::WidgetFrame* const frame = traits.frame(after, index);
  return caption_masks_screen(frame, recoloured_screens) ||
         caption_masks_container(frame, repainted);
}

}  // namespace simcore::dashboard_composition::incremental
