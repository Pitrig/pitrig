#pragma once

#include <array>
#include <cstdint>

#include "dashboard_fonts.hpp"
#include "dashboard_images.hpp"
#include "dashboard_layout.hpp"
#include "event_bus.hpp"
#include "performance_overlay_widget.hpp"
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

namespace simcore::configuration {
struct ApplicationConfiguration;
struct DashboardConfiguration;
}
namespace simcore::font_assets {
class Service;
}
namespace simcore::image_assets {
class Service;
}
namespace simcore::module_composition {
struct Modules;
}
namespace simcore::telemetry {
class ITelemetryReader;
class ITelemetryRegistry;
}
namespace simcore::transport {
class ITransport;
}

// The dashboard's own storage: every widget type's pool, the LVGL objects it
// parents them to, and the controllers over them. It is deliberately not in
// the public header — a composition root that could see this would also link
// against LVGL and against every widget type's ABI, and would be recompiled by
// any change to either.
namespace simcore::dashboard_composition {

// Per-type widget storage plus the inputs its creation needs. One of these is
// the `context` its WidgetDescriptor carries, so the manager stays free of
// widget-specific knowledge.

// What every type's creation needs, whatever it draws. Held once here so
// wiring a document into the storage is one pass over the base rather than a
// line per type, and so a new dependency reaches every type by being added in
// one place.
struct WidgetStorage {
  dashboard::Layout layout{};
  const configuration::DashboardConfiguration* dashboard{};
  const dashboard::fonts::Registry* fonts{};
  const telemetry::ITelemetryRegistry* registry{};
  const telemetry::ITelemetryReader* telemetry{};
  // Every modifier a running module can answer, indexed by ValueModifierType.
  // Held once here for the same reason the rest of this base is: a new modifier
  // reaches every widget type by being filled in at the composition root.
  dashboard::frame::ModifierReaders modifier_readers{};
};

// Each type states its configuration type, its discriminator, and the pool of
// the document it is stored in. Those three are what let the operations
// template reach a type's configurations without naming the type, which is why
// creating, updating and waking are written once rather than seven times.

struct TextWidgets : WidgetStorage {
  using Config = configuration::TextWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::text;
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
  // One of the two types that can be a parent, so one of the two that publishes
  // the objects it built. Written per pool index as each shape is created, which
  // is what lets a child resolve the container it was authored inside.
  std::span<lv_obj_t*> container_slots{};
};

struct SlotWidgets : WidgetStorage {
  using Config = configuration::SlotWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::slot;
  static constexpr auto kPool =
      &configuration::DashboardConfiguration::slot_widgets;

  // The only type with no binder at all: a slot draws nothing, and what its
  // pages watch is bound by the slots controller rather than by the widget.
  dashboard::slot_widget::Collection collection;
  // The other parent-publishing type. Written per flat page index, so a widget
  // authored on a page resolves the page the same way a nested widget resolves
  // its container.
  std::span<lv_obj_t*> page_slots{};
};

struct BarWidgets : WidgetStorage {
  using Config = configuration::BarWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::bar;
  static constexpr auto kPool =
      &configuration::DashboardConfiguration::bar_widgets;

  dashboard::frame::ValueBinder<Config, dashboard::bar_widget::kMaximumInstances>
      binder;
  dashboard::bar_widget::Collection collection;
};

struct ArcWidgets : WidgetStorage {
  using Config = configuration::ArcWidgetConfiguration;
  static constexpr auto kType = configuration::WidgetType::arc;
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
  static constexpr auto kPool =
      &configuration::DashboardConfiguration::graph_widgets;

  // Its own binder rather than the shared one: a graph draws up to three
  // sources over a single plot, so it resolves an array of them the way a text
  // widget resolves the sources it composes.
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
  // The only type that draws from an uploaded asset, so the only one that
  // carries a registry beyond the fonts every framed type may caption with.
  const dashboard::images::Registry* images{};
};

struct Dashboard {
  // Declared here and defaulted out of line on purpose. The widget pools embed
  // WidgetCondition arrays, and the contract gives those meaningful non-zero
  // defaults — kTransparentColor, at_or_above — so a constant-initialised
  // Dashboard would be ~67 KB of non-zero image in .data, paid for in flash.
  // A user-provided constructor makes initialisation dynamic instead, which
  // puts the object in .bss — external .bss, where the composition places it —
  // and runs the same initialisers at startup, after external RAM is up. That
  // is what it did while it was a member of the core's Application, which
  // needed dynamic initialisation for its own reasons.
  Dashboard();

  dashboard::fonts::Registry fonts;
  dashboard::images::Registry images;
  // One LVGL screen per configured screen, in configuration order. A widget is
  // parented by the index its frame carries, so this is what makes the shared
  // widget pool addressable.
  std::array<lv_obj_t*, configuration::kMaximumScreens> screens{};
  // The LVGL object of each shape in the pool, indexed by its pool slot. A
  // widget authored inside a container is parented to one of these and is
  // therefore placed relative to it.
  std::array<lv_obj_t*, configuration::kMaximumShapeWidgets> containers{};
  // How far each container's children reach past its own box, so the frame line
  // is not what decides whether they are drawn. Measured once after composition
  // and read back by the ext-draw-size event, so the addresses must be stable —
  // which is what makes this an array here rather than a local.
  std::array<std::int32_t, configuration::kMaximumShapeWidgets>
      container_overflow{};
  // The LVGL object of each slot page, flat: a slot's pool index times
  // kMaximumSlotPages plus the page. A widget authored on a page is parented to
  // one of these and is therefore placed relative to the slot's box.
  std::array<lv_obj_t*, dashboard::slot_widget::kMaximumPages> pages{};
  // What each page and each slot has to let through, measured and read back
  // exactly as a container's is.
  std::array<std::int32_t, dashboard::slot_widget::kMaximumPages>
      page_overflow{};
  std::array<std::int32_t, configuration::kMaximumSlotWidgets> slot_overflow{};
  // Decides which page of each slot is visible. Owns no LVGL object: the slots
  // and their pages belong to the slot collection.
  dashboard::slots::Controller slots;
  // Loads one of those screens on a swipe. Holds a view of `screens`, so it is
  // detached before they are released.
  dashboard::navigation::Controller navigation;
  dashboard::performance_overlay_widget::View performance_overlay;
  dashboard::WidgetManager widgets;
  TextWidgets text;
  ShapeWidgets shape;
  SlotWidgets slot;
  BarWidgets bar;
  ArcWidgets arc;
  IndicatorWidgets indicator;
  GraphWidgets graph;
  ImageWidgets image;
  // Firmware-lifetime: survives destroy()/create() cycles, which only replace
  // the widgets it wakes.
  dashboard::render_trigger::Trigger render_trigger;
  events::Subscription telemetry_subscription{};
};

}  // namespace simcore::dashboard_composition
