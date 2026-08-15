#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#include "application_configuration.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::dashboard {

using WidgetCreate = bool (*)(void* context);
using WidgetDestroy = void (*)(void* context);
// Root LVGL object for one instance of this widget type, addressed by its index
// in the typed storage the screen owns. Returns nullptr when that instance does
// not exist.
using WidgetRootObject = lv_obj_t* (*)(void* context, std::uint8_t index);
// Rebuilds one instance in place after its configuration changed, leaving the
// other instances of this type untouched. Returns false when the type cannot
// update that instance, and the caller falls back to a full recomposition.
using WidgetUpdateInstance = bool (*)(void* context, std::uint8_t index);

// One descriptor per widget type, mirroring the compile-time module descriptors
// in core/module_manager: function pointers plus an explicit context, no
// allocation, no RTTI, and no name-based lookup. Adding a widget type adds one
// entry to the composition table; the manager and the z-order pass do not
// change.
struct WidgetDescriptor {
  configuration::WidgetType type{};
  bool enabled{};
  WidgetCreate create{};
  WidgetDestroy destroy{};
  WidgetRootObject root_object{};
  WidgetUpdateInstance update_instance{};
  void* context{};
};

// Owns bounded widget-type lifecycle. Widget storage and dependencies stay in
// the dashboard composition and are supplied through descriptors.
class WidgetManager final {
 public:
  static constexpr std::size_t kMaximumWidgetTypes = 8;

  WidgetManager() = default;
  ~WidgetManager();

  WidgetManager(const WidgetManager&) = delete;
  WidgetManager& operator=(const WidgetManager&) = delete;

  [[nodiscard]] bool add(const WidgetDescriptor& descriptor);
  [[nodiscard]] bool create_all();
  void destroy_all();
  void clear();

  [[nodiscard]] lv_obj_t* root_object(configuration::WidgetType type,
                                      std::uint8_t index) const;
  [[nodiscard]] bool update_instance(configuration::WidgetType type,
                                     std::uint8_t index) const;

 private:
  struct Entry {
    WidgetDescriptor descriptor{};
    bool created{};
  };

  std::array<Entry, kMaximumWidgetTypes> entries_{};
  std::size_t count_{};
};

}  // namespace simcore::dashboard
