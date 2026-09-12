#pragma once

#include <cstdint>
#include <string_view>

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"
#include "telemetry_registry.hpp"

namespace pitrig::configuration::validation {

class Validator final {
 public:
  Validator(const ValidationContext& profile, ValidationFailure& failure)
      : profile_(profile), failure_(failure) {}

  void set_parent_origin(const std::int64_t x, const std::int64_t y) {
    origin_x_ = x;
    origin_y_ = y;
  }

  [[nodiscard]] bool text_widget(const TextWidgetConfiguration& config);
  [[nodiscard]] bool shape_widget(const ShapeWidgetConfiguration& config);
  [[nodiscard]] bool bar_widget(const BarWidgetConfiguration& config);
  [[nodiscard]] bool arc_widget(const ArcWidgetConfiguration& config);
  [[nodiscard]] bool indicator_widget(const IndicatorWidgetConfiguration& config);
  [[nodiscard]] bool graph_widget(const GraphWidgetConfiguration& config);
  [[nodiscard]] bool image_widget(const ImageWidgetConfiguration& config);
  [[nodiscard]] bool slot_widget(const SlotWidgetConfiguration& config);

 private:
  [[nodiscard]] bool slot_page(const SlotPageConfiguration& config);
  [[nodiscard]] bool frame(const WidgetFrame& config);
  [[nodiscard]] bool value_source(const ValueSourceConfiguration& config, std::string_view path,
                                  ValidationError error = ValidationError::invalid_widget);
  [[nodiscard]] bool value_range(const ValueRange& range);
  [[nodiscard]] bool text_source(const TextSourceConfiguration& config);
  [[nodiscard]] bool conditions(const WidgetFrame& config);

  const telemetry::TelemetryRegistry registry_{};
  const ValidationContext& profile_;
  ValidationFailure& failure_;
  std::int64_t origin_x_{};
  std::int64_t origin_y_{};
};

}
