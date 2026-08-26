#include "validation/document_rules.hpp"

#include <array>

#include "validation/value_rules.hpp"

namespace simcore::configuration::validation {

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

[[nodiscard]] bool validate_references(
    const DashboardConfiguration& dashboard,
    const std::span<const WidgetReference> references, const std::size_t count,
    const std::size_t screen_index, const WidgetParentKind parent_kind,
    const std::uint8_t parent_index, Validator& validator,
    std::size_t& action_count, ValidationFailure& failure) {
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

}
