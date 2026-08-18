#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <limits>
#include <span>
#include <string_view>

#include "configuration_json.hpp"
#include "image_asset_types.hpp"
#include "validation/value_rules.hpp"
#include "validation/widget_validator.hpp"

namespace simcore::configuration {

using validation::reject;
using validation::terminated;
using validation::valid_action;
using validation::valid_color;
using validation::Validator;

namespace {

// An uploaded package carries one face per family, so a document may not name
// more families than a package can hold. Sizes are free: every one of them is
// rasterized from the same face.
[[nodiscard]] bool within_family_budget(
    const ApplicationConfiguration& configuration) {
  std::array<font_assets::FamilyId, font_assets::kMaximumFamilies> families{};
  std::size_t count{};
  const auto record = [&families, &count](const font_assets::FontSpec& font) {
    for (std::size_t index = 0; index < count; ++index) {
      if (families[index] == font.family) {
        return true;
      }
    }
    if (count == families.size()) {
      return false;
    }
    families[count] = font.family;
    ++count;
    return true;
  };

  // Widget storage is one pool, so this walks it once rather than per screen.
  const DashboardConfiguration& dashboard = configuration.dashboard;
  const auto record_caption = [&record](const WidgetFrame& frame) {
    return frame.title.text.front() == '\0' || record(frame.title.font);
  };
  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    const TextWidgetConfiguration& widget = dashboard.text_widgets[index];
    if (!record(widget.value.font) || !record_caption(widget.frame)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.shape_widget_count; ++index) {
    if (!record_caption(dashboard.shape_widgets[index].frame)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.bar_widget_count; ++index) {
    if (!record_caption(dashboard.bar_widgets[index].frame)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.arc_widget_count; ++index) {
    if (!record_caption(dashboard.arc_widgets[index].frame)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.indicator_widget_count;
       ++index) {
    if (!record_caption(dashboard.indicator_widgets[index].frame)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.graph_widget_count; ++index) {
    if (!record_caption(dashboard.graph_widgets[index].frame)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.image_widget_count; ++index) {
    if (!record_caption(dashboard.image_widgets[index].frame)) {
      return false;
    }
  }
  return true;
}

// A box is refused only when it is *entirely* off the display, never for
// leaving its container. A caption already overhangs its widget's border by
// design, and an author may legitimately let a readout hang past the panel it
// belongs to; the display is the one edge that has no pixels beyond it.
// `origin` is where the widget's parent sits, so `placement` stays the relative
// geometry the document authored.

[[nodiscard]] bool validate_transport(
    const ApplicationConfiguration& configuration,
    const ValidationContext& profile, ValidationFailure& failure) {
  if (!configuration.telemetry_transport_present) {
    return true;
  }
  const TelemetryTransportId transport = configuration.telemetry_transport.id;
  if (transport < TelemetryTransportId::board_default ||
      transport > TelemetryTransportId::uart) {
    return reject(failure, ValidationError::invalid_transport,
                  "telemetry_transport.id");
  }
  if (transport == TelemetryTransportId::native_usb_cdc &&
      !profile.native_usb_cdc_supported) {
    return reject(failure, ValidationError::invalid_transport,
                  "telemetry_transport.id");
  }
  const UartTelemetryConfiguration& uart = configuration.telemetry_transport.uart;
  if (transport == TelemetryTransportId::uart &&
      (!profile.uart_supported || uart.port < 0 || uart.port > 2 ||
       uart.tx_pin == uart.rx_pin || uart.baud_rate < 9'600 ||
       uart.baud_rate > 2'000'000 || uart.tx_pin != profile.uart_tx_pin ||
       uart.rx_pin != profile.uart_rx_pin)) {
    return reject(failure, ValidationError::invalid_uart,
                  "telemetry_transport.uart");
  }
  return true;
}

// One ordered reference table, whether it belongs to a screen, a container shape
// or one page of a slot. Each entry must name a filled pool slot whose widget
// agrees about the parent that declared it, so a document cannot point two
// parents at one widget or leave a widget claiming a parent that never
// referenced it.
[[nodiscard]] bool validate_references(
    const DashboardConfiguration& dashboard,
    const std::span<const WidgetReference> references, const std::size_t count,
    const std::size_t screen_index, const WidgetParentKind parent_kind,
    const std::uint8_t parent_index, Validator& validator,
    std::size_t& action_count, ValidationFailure& failure) {
  // Parenting and the tap action are both facts about the frame, so one probe
  // decides whether the reference is sound before the type-specific checks run.
  const auto parented = [&](const WidgetFrame& frame) {
    if (frame.action.type != WidgetActionType::none) {
      ++action_count;
    }
    return frame.screen_index == screen_index &&
           frame.parent_kind == parent_kind &&
           (parent_kind == WidgetParentKind::screen ||
            frame.parent_index == parent_index) &&
           valid_action(frame.action, dashboard);
  };
  for (std::size_t index = 0; index < count && index < references.size();
       ++index) {
    const WidgetReference& reference = references[index];
    bool valid = false;
    switch (reference.type) {
      case WidgetType::text:
        valid = reference.index < dashboard.text_widget_count &&
                parented(dashboard.text_widgets[reference.index].frame) &&
                validator.text_widget(dashboard.text_widgets[reference.index]);
        break;
      case WidgetType::shape:
        valid =
            reference.index < dashboard.shape_widget_count &&
            parented(dashboard.shape_widgets[reference.index].frame) &&
            validator.shape_widget(dashboard.shape_widgets[reference.index]);
        break;
      case WidgetType::bar:
        valid = reference.index < dashboard.bar_widget_count &&
                parented(dashboard.bar_widgets[reference.index].frame) &&
                validator.bar_widget(dashboard.bar_widgets[reference.index]);
        break;
      case WidgetType::arc:
        valid = reference.index < dashboard.arc_widget_count &&
                parented(dashboard.arc_widgets[reference.index].frame) &&
                validator.arc_widget(dashboard.arc_widgets[reference.index]);
        break;
      case WidgetType::indicator:
        valid = reference.index < dashboard.indicator_widget_count &&
                parented(dashboard.indicator_widgets[reference.index].frame) &&
                validator.indicator_widget(
                    dashboard.indicator_widgets[reference.index]);
        break;
      case WidgetType::image:
        valid =
            reference.index < dashboard.image_widget_count &&
            parented(dashboard.image_widgets[reference.index].frame) &&
            validator.image_widget(dashboard.image_widgets[reference.index]);
        break;
      case WidgetType::graph:
        valid =
            reference.index < dashboard.graph_widget_count &&
            parented(dashboard.graph_widgets[reference.index].frame) &&
            validator.graph_widget(dashboard.graph_widgets[reference.index]);
        break;
      case WidgetType::slot:
        valid = reference.index < dashboard.slot_widget_count &&
                parented(dashboard.slot_widgets[reference.index].frame) &&
                validator.slot_widget(dashboard.slot_widgets[reference.index]);
        break;
    }
    if (!valid) {
      (void)reject(failure, ValidationError::invalid_widget, "widgets");
      failure.widget_index = static_cast<std::int16_t>(index);
      return false;
    }
  }
  return true;
}

}  // namespace

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
  if (!validate_transport(configuration, profile, failure)) {
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
    if (!validate_references(dashboard, screen.widgets, screen.widget_count,
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
    if (!validate_references(dashboard, shape.widgets, shape.widget_count,
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
      if (!validate_references(dashboard, config.widgets, config.widget_count,
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
  if (!within_family_budget(configuration)) {
    (void)reject(failure, ValidationError::invalid_widget, "font");
    return failure;
  }
  return failure;
}

}  // namespace simcore::configuration
