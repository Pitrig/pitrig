#pragma once

#include <cstdint>
#include <span>
#include <string_view>

#include "application_configuration.hpp"
#include "dashboard_composition.hpp"
#include "logger.hpp"
#include "widget_descriptor.hpp"

namespace pitrig::dashboard_composition {

template <typename Storage>
struct WidgetOpsCommon {
  static void destroy(void* const context) {
    storage(context).collection.destroy();
  }

  static lv_obj_t* root_object(void* const context, const std::uint8_t index) {
    return storage(context).collection.root_object(index);
  }

  static lv_obj_t* caption_object(void* const context, const std::uint8_t index) {
    return storage(context).collection.caption_object(index);
  }

  [[nodiscard]] static bool sync_count(void* const context,
                                       const std::uint8_t count) {
    auto& collection = storage(context).collection;
    return count >= collection.instance_count() ? collection.extend_to(count)
                                                : collection.shrink_to(count);
  }

 protected:
  static Storage& storage(void* const context) {
    return *static_cast<Storage*>(context);
  }

  static std::span<const typename Storage::Config> configurations(
      const Storage& widgets) {
    const auto& pool = widgets.dashboard->*Storage::kPool;
    return {pool.data(),
            configuration::widget_traits(Storage::kType).count(*widgets.dashboard)};
  }

  [[nodiscard]] static bool rebind(
      Storage& widgets,
      const std::span<const typename Storage::Config> configurations) {
    if constexpr (Storage::kSmoothsSource) {
      return widgets.binder.bind(configurations, *widgets.registry,
                                 *widgets.telemetry, widgets.modifier_readers,
                                 widgets.smoothing);
    } else {
      return widgets.binder.bind(configurations, *widgets.registry,
                                 *widgets.telemetry, widgets.modifier_readers);
    }
  }

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
      } else if constexpr (requires { widgets.container_slots; }) {
        return widgets.collection.create(widgets.layout, configurations,
                                         widgets.binder.bindings(),
                                         *widgets.fonts,
                                         widgets.container_slots);
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
    } else if constexpr (requires { widgets.container_slots; }) {
      return widgets.collection.recreate(
          index, widgets.layout, configurations[index],
          widgets.binder.bindings()[index], *widgets.fonts,
          widgets.container_slots);
    } else {
      return widgets.collection.recreate(index, widgets.layout,
                                         configurations[index],
                                         widgets.binder.bindings()[index],
                                         *widgets.fonts);
    }
  }
};

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

  [[nodiscard]] static bool update_instance(void* const context,
                                            const std::uint8_t index) {
    Storage& widgets = Common::storage(context);
    const auto configurations = Common::configurations(widgets);
    if (index >= configurations.size()) {
      return false;
    }
    return widgets.collection.update(index, widgets.layout,
                                     configurations[index], *widgets.fonts,
                                     widgets.page_slots);
  }
};

template <typename Ops, typename Storage>
[[nodiscard]] dashboard::WidgetDescriptor widget_descriptor(Storage& widgets) {
  dashboard::WidgetDescriptor descriptor{
      .type = Storage::kType,
      .enabled = configuration::widget_traits(Storage::kType)
                     .count(*widgets.dashboard) > 0,
      .create = &Ops::create,
      .destroy = &Ops::destroy,
      .root_object = &Ops::root_object,
      .caption_object = &Ops::caption_object,
      .update_instance = &Ops::update_instance,
      .sync_count = &Ops::sync_count,
      .wake = nullptr,
      .context = &widgets,
  };
  if constexpr (requires { &Ops::wake; }) {
    descriptor.wake = &Ops::wake;
  }
  return descriptor;
}

}
