#include <array>
#include <cstddef>
#include <span>
#include <string_view>

#include "configuration_json.hpp"
#include "image_asset_types.hpp"
#include "validation/document_rules.hpp"
#include "validation/value_rules.hpp"
#include "validation/widget_validator.hpp"

namespace simcore::configuration {

using validation::reject;
using validation::terminated;
using validation::valid_color;
using validation::Validator;

ValidationFailure validate_configuration(
    const ApplicationConfiguration& configuration,
    const ValidationContext& profile) {
  ValidationFailure failure{};

  if (configuration.board.id < BoardId::t_display_s3 ||
      configuration.board.id > BoardId::guition_jc1060p470c) {
    (void)reject(failure, ValidationError::invalid_board, "board");
    return failure;
  }
  if (configuration.board.id != profile.board) {
    (void)reject(failure, ValidationError::board_mismatch, "board");
    return failure;
  }
  if (profile.display.width <= 0 || profile.display.height <= 0 ||
      configuration.hardware.device_count != 0) {
    (void)reject(failure, ValidationError::invalid_hardware, "hardware");
    return failure;
  }
  if (!validation::validate_transport(configuration, profile, failure)) {
    return failure;
  }

  const DashboardConfiguration& dashboard = configuration.dashboard;
  if (dashboard.screen_count > dashboard.screens.size()) {
    (void)reject(failure, ValidationError::invalid_screen, "dashboard.screens");
    return failure;
  }
  if (dashboard.text_widget_count > dashboard.text_widgets.size() ||
      dashboard.shape_widget_count > dashboard.shape_widgets.size() ||
      dashboard.bar_widget_count > dashboard.bar_widgets.size() ||
      dashboard.arc_widget_count > dashboard.arc_widgets.size() ||
      dashboard.indicator_widget_count > dashboard.indicator_widgets.size() ||
      dashboard.graph_widget_count > dashboard.graph_widgets.size() ||
      dashboard.image_widget_count > dashboard.image_widgets.size() ||
      dashboard.slot_widget_count > dashboard.slot_widgets.size()) {
    (void)reject(failure, ValidationError::invalid_dashboard, "dashboard");
    return failure;
  }

  // A reference index is a std::uint8_t, so a pool that outgrew that would
  // silently alias its first entries.
  static_assert(kMaximumTextWidgets <= 255);
  static_assert(kMaximumShapeWidgets <= 255);
  static_assert(kMaximumBarWidgets <= 255);
  static_assert(kMaximumArcWidgets <= 255);
  static_assert(kMaximumIndicatorWidgets <= 255);
  static_assert(kMaximumGraphWidgets <= 255);
  static_assert(kMaximumImageWidgets <= 255);
  // A page is addressed by arithmetic over the slot pool rather than by a pool
  // of its own, so it is the product that has to stay inside a std::uint8_t.
  static_assert(kMaximumSlotWidgets * kMaximumSlotPages <= 255);

  // Three prose promises the schema makes, turned into build errors. Each was
  // asserted in two or three documents and enforced nowhere, and the first is
  // the one that had already gone wrong: dashboard-editor-parity.md claimed a
  // shape cap of 24 against a real 32 and omitted slots, so the sum it stated
  // did not hold.
  static_assert(kMaximumWidgetsPerScreen ==
                kMaximumTextWidgets + kMaximumShapeWidgets +
                    kMaximumSlotWidgets + kMaximumBarWidgets +
                    kMaximumArcWidgets + kMaximumIndicatorWidgets +
                    kMaximumGraphWidgets + kMaximumImageWidgets);
  static_assert(kImageIdCapacity == image_assets::kImageIdCapacity);

  Validator validator(profile, failure);
  std::size_t lap_timer_modifier_count{};
  std::size_t referenced_widgets{};
  std::size_t action_count{};

  for (std::size_t screen_index = 0; screen_index < dashboard.screen_count;
       ++screen_index) {
    const ScreenConfiguration& screen = dashboard.screens[screen_index];
    if (!valid_color(screen.background_color) || !terminated(screen.id)) {
      (void)reject(failure, ValidationError::invalid_screen, "background_color");
      failure.screen_index = static_cast<std::int16_t>(screen_index);
      return failure;
    }
    if (screen.widget_count > screen.widgets.size()) {
      (void)reject(failure, ValidationError::invalid_screen, "widgets");
      failure.screen_index = static_cast<std::int16_t>(screen_index);
      return failure;
    }
    referenced_widgets += screen.widget_count;
    validator.set_parent_origin(0, 0);
    if (!validation::validate_references(dashboard, screen.widgets, screen.widget_count,
                             screen_index, WidgetParentKind::screen, 0,
                             validator, action_count, failure)) {
      failure.screen_index = static_cast<std::int16_t>(screen_index);
      return failure;
    }
  }

  // Where every page sits on the display. A slot is only ever authored on a
  // screen, so a page's box is the slot's own and nothing has to be resolved
  // before it — which is also why this runs before the shape pass, whose
  // containers may sit on a page.
  constexpr std::size_t kPageTableSize = kMaximumSlotWidgets * kMaximumSlotPages;
  std::array<std::int32_t, kPageTableSize> page_origin_x{};
  std::array<std::int32_t, kPageTableSize> page_origin_y{};
  for (std::size_t index = 0; index < dashboard.slot_widget_count; ++index) {
    const SlotWidgetConfiguration& slot = dashboard.slot_widgets[index];
    for (std::size_t page = 0; page < slot.page_count; ++page) {
      const std::size_t flat = index * kMaximumSlotPages + page;
      page_origin_x[flat] = slot.frame.placement.x;
      page_origin_y[flat] = slot.frame.placement.y;
    }
  }

  // Where every container shape sits on the display, so a child's relative
  // geometry can be checked against the one edge that still bounds it. The pool
  // is ordered parent-before-child by construction, so one forward pass resolves
  // any depth — and a parent index that is not lower than its own is the shape
  // of a cycle, which is refused here rather than assumed impossible.
  std::array<std::int32_t, kMaximumShapeWidgets> origin_x{};
  std::array<std::int32_t, kMaximumShapeWidgets> origin_y{};
  std::array<std::uint8_t, kMaximumShapeWidgets> depth{};
  for (std::size_t index = 0; index < dashboard.shape_widget_count; ++index) {
    const WidgetFrame& frame = dashboard.shape_widgets[index].frame;
    switch (frame.parent_kind) {
      case WidgetParentKind::screen:
        origin_x[index] = 0;
        origin_y[index] = 0;
        depth[index] = 0;
        continue;
      case WidgetParentKind::shape:
        if (frame.parent_index >= index) {
          (void)reject(failure, ValidationError::invalid_widget, "widgets");
          return failure;
        }
        origin_x[index] =
            origin_x[frame.parent_index] +
            dashboard.shape_widgets[frame.parent_index].frame.placement.x;
        origin_y[index] =
            origin_y[frame.parent_index] +
            dashboard.shape_widgets[frame.parent_index].frame.placement.y;
        depth[index] = static_cast<std::uint8_t>(depth[frame.parent_index] + 1);
        break;
      case WidgetParentKind::slot_page:
        if (frame.parent_index >= kPageTableSize) {
          (void)reject(failure, ValidationError::invalid_widget, "widgets");
          return failure;
        }
        // The page table already holds the absolute box, and a slot is always
        // authored on a screen, so the depth is fixed: the slot sits at 0 and
        // its pages cost nothing, which leaves this shape at 1 — exactly where
        // it would be inside a container shape on the same screen.
        origin_x[index] = page_origin_x[frame.parent_index];
        origin_y[index] = page_origin_y[frame.parent_index];
        depth[index] = 1;
        break;
    }
    if (depth[index] >= kMaximumNestingDepth) {
      (void)reject(failure, ValidationError::invalid_widget, "widgets");
      return failure;
    }
  }

  // Each container's own table, flat over the pool: ordering only ever happens
  // among one parent's children, so depth costs nothing here.
  for (std::size_t index = 0; index < dashboard.shape_widget_count; ++index) {
    const ShapeWidgetConfiguration& shape = dashboard.shape_widgets[index];
    if (shape.widget_count == 0) {
      continue;
    }
    referenced_widgets += shape.widget_count;
    validator.set_parent_origin(origin_x[index] + shape.frame.placement.x,
                                origin_y[index] + shape.frame.placement.y);
    if (!validation::validate_references(dashboard, shape.widgets, shape.widget_count,
                             shape.frame.screen_index, WidgetParentKind::shape,
                             static_cast<std::uint8_t>(index), validator,
                             action_count, failure)) {
      failure.screen_index =
          static_cast<std::int16_t>(shape.frame.screen_index);
      return failure;
    }
  }

  // Every page's own table. A page is not a widget and holds no reference of its
  // own, so its widgets are counted here rather than through the slot.
  for (std::size_t index = 0; index < dashboard.slot_widget_count; ++index) {
    const SlotWidgetConfiguration& slot = dashboard.slot_widgets[index];
    for (std::size_t page = 0; page < slot.page_count; ++page) {
      const SlotPageConfiguration& config = slot.pages[page];
      if (config.widget_count == 0) {
        continue;
      }
      const std::size_t flat = index * kMaximumSlotPages + page;
      referenced_widgets += config.widget_count;
      validator.set_parent_origin(page_origin_x[flat], page_origin_y[flat]);
      if (!validation::validate_references(dashboard, config.widgets, config.widget_count,
                               slot.frame.screen_index,
                               WidgetParentKind::slot_page,
                               static_cast<std::uint8_t>(flat), validator,
                               action_count, failure)) {
        failure.screen_index =
            static_cast<std::int16_t>(slot.frame.screen_index);
        return failure;
      }
    }
  }
  validator.set_parent_origin(0, 0);

  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    const TextWidgetConfiguration& widget = dashboard.text_widgets[index];
    for (std::size_t source = 0; source < widget.source_count; ++source) {
      const TextSourceConfiguration& value = widget.sources[source];
      for (std::size_t modifier = 0; modifier < value.modifier_count;
           ++modifier) {
        if (value.modifiers[modifier].type == ValueModifierType::lap_timer) {
          ++lap_timer_modifier_count;
        }
      }
    }
  }

  // Only the parser produces documents, and it appends one reference per pool
  // slot it fills. An unreferenced slot would render nothing and still cost its
  // storage, so treat the mismatch as a malformed dashboard rather than trust
  // that no other path can build one.
  if (referenced_widgets !=
      static_cast<std::size_t>(dashboard.text_widget_count) +
          dashboard.shape_widget_count + dashboard.bar_widget_count +
          dashboard.arc_widget_count + dashboard.indicator_widget_count +
          dashboard.graph_widget_count + dashboard.image_widget_count +
          dashboard.slot_widget_count) {
    (void)reject(failure, ValidationError::invalid_dashboard, "dashboard");
    return failure;
  }

  // Each action makes one object clickable and holds one binding at runtime.
  if (action_count > kMaximumActions) {
    (void)reject(failure, ValidationError::invalid_widget, "action");
    return failure;
  }

  // One Lap Timer module instance backs every lap_timer modifier, so only one
  // widget may claim it across the whole dashboard.
  if (lap_timer_modifier_count > 1) {
    (void)reject(failure, ValidationError::invalid_widget, "modifiers");
    return failure;
  }
  if (!validation::within_family_budget(configuration)) {
    (void)reject(failure, ValidationError::invalid_widget, "font");
    return failure;
  }
  return failure;
}

}  // namespace simcore::configuration
