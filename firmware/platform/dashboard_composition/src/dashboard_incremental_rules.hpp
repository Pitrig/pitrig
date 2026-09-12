#pragma once

#include <algorithm>
#include <bitset>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <span>

#include "application_configuration.hpp"
#include "widget_frame.hpp"

namespace pitrig::dashboard_composition::incremental {

[[nodiscard]] inline bool caption_masks_parent(const configuration::WidgetFrame* const frame) {
  return frame != nullptr && frame->title.text.front() != '\0' && frame->border.width_px != 0 &&
         dashboard::frame::caption_mask_reads_parent(*frame);
}

[[nodiscard]] inline bool caption_masks_screen(const configuration::WidgetFrame* const frame,
                                               const std::uint32_t recoloured) {
  return caption_masks_parent(frame) && (recoloured & (1U << frame->screen_index)) != 0;
}

using ContainerSet = std::bitset<configuration::kMaximumShapeWidgets>;

[[nodiscard]] inline bool caption_masks_container(const configuration::WidgetFrame* const frame,
                                                  const ContainerSet& repainted) {
  return caption_masks_parent(frame) &&
         frame->parent_kind == configuration::WidgetParentKind::shape &&
         frame->parent_index < repainted.size() && repainted.test(frame->parent_index);
}

[[nodiscard]] inline bool is_container(const configuration::WidgetType type) {
  return type == configuration::WidgetType::shape || type == configuration::WidgetType::slot;
}

[[nodiscard]] inline bool content_box_moved(const configuration::WidgetFrame& was,
                                            const configuration::WidgetFrame& now) {
  return was.border.width_px != now.border.width_px || was.padding.left != now.padding.left ||
         was.padding.top != now.padding.top || was.padding.right != now.padding.right ||
         was.padding.bottom != now.padding.bottom || was.placement.width != now.placement.width ||
         was.placement.height != now.placement.height;
}

struct ContainerChanges {
  ContainerSet repainted{};
  ContainerSet reshaped{};
};

[[nodiscard]] inline ContainerChanges changed_containers(
    const configuration::DashboardConfiguration& before,
    const configuration::DashboardConfiguration& after) {
  ContainerChanges changes{};
  const std::uint8_t common = std::min(before.shape_widget_count, after.shape_widget_count);
  for (std::uint8_t index = 0; index < common; ++index) {
    const configuration::WidgetFrame& was = before.shape_widgets[index].frame;
    const configuration::WidgetFrame& now = after.shape_widgets[index].frame;
    if (was.background_color != now.background_color ||
        was.background_inset_px != now.background_inset_px) {
      changes.repainted.set(index);
    }
    if (content_box_moved(was, now)) {
      changes.reshaped.set(index);
    }
  }
  return changes;
}

[[nodiscard]] inline bool inside_reshaped_container(const configuration::WidgetFrame* const frame,
                                                    const ContainerSet& reshaped) {
  return frame != nullptr && frame->parent_kind == configuration::WidgetParentKind::shape &&
         frame->parent_index < reshaped.size() && reshaped.test(frame->parent_index);
}

[[nodiscard]] inline bool needs_update(const configuration::WidgetTypeTraits& traits,
                                       const configuration::DashboardConfiguration& before,
                                       const configuration::DashboardConfiguration& after,
                                       const std::uint8_t index, const std::uint8_t previous_count,
                                       const std::uint32_t recoloured_screens,
                                       const ContainerChanges& containers) {
  if (index >= previous_count) {
    return true;
  }
  const std::span<const std::byte> left = traits.element_bytes(before, index);
  const std::span<const std::byte> right = traits.element_bytes(after, index);
  if (left.size() != right.size() || std::memcmp(left.data(), right.data(), left.size()) != 0) {
    return true;
  }
  const configuration::WidgetFrame* const frame = traits.frame(after, index);
  return caption_masks_screen(frame, recoloured_screens) ||
         caption_masks_container(frame, containers.repainted) ||
         inside_reshaped_container(frame, containers.reshaped);
}

}
