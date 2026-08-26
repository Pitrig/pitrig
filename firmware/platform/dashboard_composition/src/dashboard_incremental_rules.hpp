#pragma once

#include <algorithm>
#include <bitset>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <span>

#include "application_configuration.hpp"
#include "widget_frame.hpp"

namespace simcore::dashboard_composition::incremental {

[[nodiscard]] inline bool caption_masks_parent(
    const configuration::WidgetFrame* const frame) {
  return frame != nullptr && frame->title.text.front() != '\0' &&
         frame->border.width_px != 0 &&
         dashboard::frame::caption_mask_reads_parent(*frame);
}

[[nodiscard]] inline bool caption_masks_screen(
    const configuration::WidgetFrame* const frame,
    const std::uint32_t recoloured) {
  return caption_masks_parent(frame) &&
         (recoloured & (1U << frame->screen_index)) != 0;
}

using ContainerSet = std::bitset<configuration::kMaximumShapeWidgets>;

[[nodiscard]] inline bool caption_masks_container(
    const configuration::WidgetFrame* const frame,
    const ContainerSet& repainted) {
  return caption_masks_parent(frame) &&
         frame->parent_kind == configuration::WidgetParentKind::shape &&
         frame->parent_index < repainted.size() &&
         repainted.test(frame->parent_index);
}

[[nodiscard]] inline bool is_container(const configuration::WidgetType type) {
  return type == configuration::WidgetType::shape ||
         type == configuration::WidgetType::slot;
}

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

}
