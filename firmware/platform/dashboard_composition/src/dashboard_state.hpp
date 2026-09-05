#pragma once

#include <array>
#include <cstdint>

#include "dashboard_fonts.hpp"
#include "dashboard_images.hpp"
#include "dashboard_layout.hpp"
#include "event_bus.hpp"
#include "pitrig_features.hpp"
#if PITRIG_DEBUG
#include "fps_overlay_widget.hpp"
#include "performance_overlay_widget.hpp"
#endif
#include "arc_widget.hpp"
#include "bar_widget.hpp"
#include "graph_binding.hpp"
#include "graph_widget.hpp"
#include "image_widget.hpp"
#include "indicator_widget.hpp"
#include "render_trigger.hpp"
#include "screen_navigation.hpp"
#include "shape_widget.hpp"
#include "slot_widget.hpp"
#include "text_widget.hpp"
#include "widget_slots.hpp"
#include "widget_binding.hpp"
#include "widget_descriptor.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace pitrig::configuration {
struct ApplicationConfiguration;
struct DashboardConfiguration;
}
namespace pitrig::font_assets {
class Service;
}
namespace pitrig::image_assets {
class Service;
}
namespace pitrig::module_composition {
struct Modules;
}
namespace pitrig::telemetry {
class ITelemetryReader;
class ITelemetryRegistry;
}
namespace pitrig::transport {
class ITransport;
}
namespace pitrig::value_smoothing {
class Service;
}

namespace pitrig::dashboard_composition {

struct WidgetStorage {
  static constexpr bool kSmoothsSource = false;

  dashboard::Layout layout{};
  const configuration::DashboardConfiguration* dashboard{};
  const dashboard::fonts::Registry* fonts{};
  const telemetry::ITelemetryRegistry* registry{};
  const telemetry::ITelemetryReader* telemetry{};
  dashboard::frame::ModifierReaders modifier_readers{};
  value_smoothing::Service* smoothing{};
};

struct TextWidgets : WidgetStorage {
  using Config = configuration::TextWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::text;
  static constexpr bool kSmoothsSource = true;
  static constexpr auto kPool =
      &configuration::DashboardConfiguration::text_widgets;

  dashboard::text_widget::Binder binder;
  dashboard::text_widget::Collection collection;
};

struct ShapeWidgets : WidgetStorage {
  using Config = configuration::ShapeWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::shape;
  static constexpr auto kPool =
      &configuration::DashboardConfiguration::shape_widgets;

  dashboard::frame::ConditionBinder<Config,
                                    dashboard::shape_widget::kMaximumInstances>
      binder;
  dashboard::shape_widget::Collection collection;
  std::span<lv_obj_t*> container_slots{};
};

struct SlotWidgets : WidgetStorage {
  using Config = configuration::SlotWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::slot;
  static constexpr auto kPool =
      &configuration::DashboardConfiguration::slot_widgets;

  dashboard::slot_widget::Collection collection;
  std::span<lv_obj_t*> page_slots{};
};

struct BarWidgets : WidgetStorage {
  using Config = configuration::BarWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::bar;
  static constexpr bool kSmoothsSource = true;
  static constexpr auto kPool =
      &configuration::DashboardConfiguration::bar_widgets;

  dashboard::frame::ValueBinder<Config, dashboard::bar_widget::kMaximumInstances>
      binder;
  dashboard::bar_widget::Collection collection;
};

struct ArcWidgets : WidgetStorage {
  using Config = configuration::ArcWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::arc;
  static constexpr bool kSmoothsSource = true;
  static constexpr auto kPool =
      &configuration::DashboardConfiguration::arc_widgets;

  dashboard::frame::ValueBinder<Config, dashboard::arc_widget::kMaximumInstances>
      binder;
  dashboard::arc_widget::Collection collection;
};

struct IndicatorWidgets : WidgetStorage {
  using Config = configuration::IndicatorWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::indicator;
  static constexpr auto kPool =
      &configuration::DashboardConfiguration::indicator_widgets;

  dashboard::frame::ValueBinder<Config,
                                dashboard::indicator_widget::kMaximumInstances>
      binder;
  dashboard::indicator_widget::Collection collection;
};

struct GraphWidgets : WidgetStorage {
  using Config = configuration::GraphWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::graph;
  static constexpr bool kSmoothsSource = true;
  static constexpr auto kPool =
      &configuration::DashboardConfiguration::graph_widgets;

  dashboard::graph_widget::Binder binder;
  dashboard::graph_widget::Collection collection;
};

struct ImageWidgets : WidgetStorage {
  using Config = configuration::ImageWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::image;
  static constexpr auto kPool =
      &configuration::DashboardConfiguration::image_widgets;

  dashboard::image_widget::Binder binder;
  dashboard::image_widget::Collection collection;
  const dashboard::images::Registry* images{};
};

struct Dashboard {
  Dashboard();

  dashboard::fonts::Registry fonts;
  dashboard::images::Registry images;
  std::array<lv_obj_t*, configuration::kMaximumScreens> screens{};
  std::array<lv_obj_t*, configuration::kMaximumShapeWidgets> containers{};
  std::array<std::int32_t, configuration::kMaximumShapeWidgets>
      container_overflow{};
  std::array<lv_obj_t*, dashboard::slot_widget::kMaximumPages> pages{};
  std::array<std::int32_t, dashboard::slot_widget::kMaximumPages>
      page_overflow{};
  std::array<std::int32_t, configuration::kMaximumSlotWidgets> slot_overflow{};
  dashboard::slots::Controller slots;
  dashboard::navigation::Controller navigation;
#if PITRIG_DEBUG
  dashboard::performance_overlay_widget::View performance_overlay;
  dashboard::fps_overlay_widget::View fps_overlay;
#endif
  dashboard::WidgetManager widgets;
  TextWidgets text;
  ShapeWidgets shape;
  SlotWidgets slot;
  BarWidgets bar;
  ArcWidgets arc;
  IndicatorWidgets indicator;
  GraphWidgets graph;
  ImageWidgets image;
  dashboard::render_trigger::Trigger render_trigger;
  events::Subscription telemetry_subscription{};
};

}
