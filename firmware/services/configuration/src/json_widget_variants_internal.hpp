#pragma once

#include "application_configuration.hpp"
#include "cJSON.h"

namespace pitrig::configuration::json::variants {

[[nodiscard]] bool parse_bar_widget(const cJSON* object,
                                    BarWidgetConfiguration& config,
                                    ValidationFailure& failure);
[[nodiscard]] bool parse_arc_widget(const cJSON* object,
                                    ArcWidgetConfiguration& config,
                                    ValidationFailure& failure);
[[nodiscard]] bool parse_indicator_widget(const cJSON* object,
                                          IndicatorWidgetConfiguration& config,
                                          ValidationFailure& failure);
[[nodiscard]] bool parse_graph_widget(const cJSON* object,
                                      GraphWidgetConfiguration& config,
                                      ValidationFailure& failure);

}
