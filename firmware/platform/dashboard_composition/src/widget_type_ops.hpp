#pragma once

#include <cstdint>
#include <span>
#include <string_view>

#include "application_configuration.hpp"
#include "dashboard_composition.hpp"
#include "logger.hpp"
#include "widget_descriptor.hpp"

namespace simcore::dashboard_composition {

// The WidgetDescriptor entries of one widget type, written once for every type
// instead of once per type. A descriptor is five function pointers over an
// opaque context (ADR 0015); the context is that type's storage, and the only
// thing the manager may not know is which concrete type it holds. That
// knowledge lives here, in one template, rather than in seven copies of the
// same five functions.
//
// Three shapes exist because three shapes of collection exist: a type that
// draws a value takes the resolved bindings, a type that only restyles takes the
// reads its rules watch, and the slot takes neither because it draws nothing at
// all. They share everything else through WidgetOpsCommon.

// Destroying and reaching a root object are the same calls whatever the type
// draws, so they are written here and inherited by all three. Waking is not:
// it belongs to a render timer, and the type with nothing to re-render has
// none — which is exactly what makes the descriptor's wake entry optional.
template <typename Storage>
struct WidgetOpsCommon {
  static void destroy(void* const context) {
    storage(context).collection.destroy();
  }

  static lv_obj_t* root_object(void* const context, const std::uint8_t index) {
    return storage(context).collection.root_object(index);
  }

 protected:
  static Storage& storage(void* const context) {
    return *static_cast<Storage*>(context);
  }

  // The type's slice of the document's widget pool. The count comes from the
  // generated traits table, so this holds no per-type knowledge beyond the
  // pool the storage names.
  static std::span<const typename Storage::Config> configurations(
      const Storage& widgets) {
    const auto& pool = widgets.dashboard->*Storage::kPool;
    return {pool.data(),
            configuration::widget_traits(Storage::kType).count(*widgets.dashboard)};
  }

  // Re-resolving every binding is pure computation over a bounded array and no
  // LVGL work, so an update does this rather than tracking which one changed.
  [[nodiscard]] static bool rebind(
      Storage& widgets,
      const std::span<const typename Storage::Config> configurations) {
    return widgets.binder.bind(configurations, *widgets.registry,
                               *widgets.telemetry, widgets.modifier_readers);
  }

  // The type is named from the traits table rather than baked into a per-type
  // message, so the log still says which type failed without seven copies of
  // the same two lines.
  [[nodiscard]] static bool report_bind_failure() {
    log::error("dashboard", "Failed to resolve %.*s widget bindings",
               static_cast<int>(type_name().size()), type_name().data());
    return false;
  }

  [[nodiscard]] static bool report_create_failure() {
    log::error("dashboard", "Failed to create %.*s widgets",
               static_cast<int>(type_name().size()), type_name().data());
    return false;
  }

  static std::string_view type_name() {
    return configuration::widget_traits(Storage::kType).name;
  }
};

// Types whose collection draws a bound value: text, bar, arc, indicator, graph,
// and image — which binds one only to choose between the frames of a sprite
// sheet, but binds it the same way. Image is also the only one that draws from
// an uploaded asset, which is the single compile-time branch below.
template <typename Storage>
struct ValueWidgetOps : WidgetOpsCommon<Storage> {
  using Common = WidgetOpsCommon<Storage>;

  static void wake(void* const context) {
    Common::storage(context).collection.wake();
  }

  [[nodiscard]] static bool create(void* const context) {
    Storage& widgets = Common::storage(context);
    const auto configurations = Common::configurations(widgets);
    if (!Common::rebind(widgets, configurations)) {
      return Common::report_bind_failure();
    }
    const bool created = [&] {
      if constexpr (requires { widgets.images; }) {
        return widgets.collection.create(widgets.layout, configurations,
                                         widgets.binder.bindings(),
                                         *widgets.fonts, *widgets.images);
      } else {
        return widgets.collection.create(widgets.layout, configurations,
                                         widgets.binder.bindings(),
                                         *widgets.fonts);
      }
    }();
    return created ? true : Common::report_create_failure();
  }

  [[nodiscard]] static bool update_instance(void* const context,
                                            const std::uint8_t index) {
    Storage& widgets = Common::storage(context);
    const auto configurations = Common::configurations(widgets);
    if (index >= configurations.size() ||
        !Common::rebind(widgets, configurations)) {
      return false;
    }
    if constexpr (requires { widgets.images; }) {
      return widgets.collection.recreate(
          index, widgets.layout, configurations[index],
          widgets.binder.bindings()[index], *widgets.fonts, *widgets.images);
    } else {
      return widgets.collection.recreate(index, widgets.layout,
                                         configurations[index],
                                         widgets.binder.bindings()[index],
                                         *widgets.fonts);
    }
  }
};

// Types that bind no telemetry of their own — only their styling rules watch
// one. Shape is the only one left: it publishes the containers it built so
// children can be parented to them, which is a compile-time branch on the
// storage rather than a template of its own.
template <typename Storage>
struct ConditionWidgetOps : WidgetOpsCommon<Storage> {
  using Common = WidgetOpsCommon<Storage>;

  static void wake(void* const context) {
    Common::storage(context).collection.wake();
  }

  [[nodiscard]] static bool create(void* const context) {
    Storage& widgets = Common::storage(context);
    const auto configurations = Common::configurations(widgets);
    if (!Common::rebind(widgets, configurations)) {
      return Common::report_bind_failure();
    }
    const bool created = [&] {
      if constexpr (requires { widgets.container_slots; }) {
        return widgets.collection.create(
            widgets.layout, configurations, widgets.binder.reads(),
            widgets.binder.contexts(), *widgets.fonts,
            widgets.container_slots);
      } else {
        return widgets.collection.create(
            widgets.layout, configurations, widgets.binder.reads(),
            widgets.binder.contexts(), *widgets.fonts);
      }
    }();
    return created ? true : Common::report_create_failure();
  }

  [[nodiscard]] static bool update_instance(void* const context,
                                            const std::uint8_t index) {
    Storage& widgets = Common::storage(context);
    const auto configurations = Common::configurations(widgets);
    if (index >= configurations.size() ||
        !Common::rebind(widgets, configurations)) {
      return false;
    }
    if constexpr (requires { widgets.container_slots; }) {
      return widgets.collection.recreate(
          index, widgets.layout, configurations[index],
          widgets.binder.reads()[index], widgets.binder.contexts()[index],
          *widgets.fonts, widgets.container_slots);
    } else {
      return widgets.collection.recreate(
          index, widgets.layout, configurations[index],
          widgets.binder.reads()[index], widgets.binder.contexts()[index],
          *widgets.fonts);
    }
  }
};

// The slot: the only type that neither draws nor binds anything of its own. It
// builds the objects and stops there — which page of them is visible, and what
// telemetry raises it, belong to the slots controller. So there is no binder to
// rebind, no timer to wake, and rebuilding one instance is not possible at all:
// a slot's pages hold other widgets, and deleting the slot deletes them with it.
template <typename Storage>
struct SlotWidgetOps : WidgetOpsCommon<Storage> {
  using Common = WidgetOpsCommon<Storage>;

  [[nodiscard]] static bool create(void* const context) {
    Storage& widgets = Common::storage(context);
    if (!widgets.collection.create(widgets.layout,
                                   Common::configurations(widgets),
                                   *widgets.fonts, widgets.page_slots)) {
      return Common::report_create_failure();
    }
    return true;
  }

  [[nodiscard]] static bool update_instance(void*, std::uint8_t) {
    return false;
  }
};

// One descriptor for one type's storage. `enabled` follows the document: a type
// the configuration never uses is registered but never built.
template <typename Ops, typename Storage>
[[nodiscard]] dashboard::WidgetDescriptor widget_descriptor(Storage& widgets) {
  dashboard::WidgetDescriptor descriptor{
      .type = Storage::kType,
      .enabled = configuration::widget_traits(Storage::kType)
                     .count(*widgets.dashboard) > 0,
      .create = &Ops::create,
      .destroy = &Ops::destroy,
      .root_object = &Ops::root_object,
      .update_instance = &Ops::update_instance,
      .wake = nullptr,
      .context = &widgets,
  };
  // A type with nothing to re-render provides no wake, which the manager
  // already treats as an optional entry.
  if constexpr (requires { &Ops::wake; }) {
    descriptor.wake = &Ops::wake;
  }
  return descriptor;
}

}  // namespace simcore::dashboard_composition
