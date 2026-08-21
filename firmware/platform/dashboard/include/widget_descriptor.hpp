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
// Brings the type's instance pool to `count`, reserving the slots a replacement
// added empty and releasing the ones it removed. A reserved slot is built by
// the update entry above, so an added widget travels the path a changed one
// does. Returns false when the type cannot.
using WidgetSyncCount = bool (*)(void* context, std::uint8_t count);
// Marks the type's render timers ready because a source value changed. Called
// with the LVGL lock held; must not block. Optional.
using WidgetWake = void (*)(void* context);

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
  WidgetSyncCount sync_count{};
  WidgetWake wake{};
  void* context{};
};

// Owns bounded widget-type lifecycle. Widget storage and dependencies stay in
// the dashboard composition and are supplied through descriptors.
//
// wake_all() may run on the render-trigger task while the composition rebuilds
// the table on another task, so add(), clear(), and wake_all() are serialised
// by the LVGL lock: the composition holds it while assembling or clearing the
// table, and the trigger holds it while waking.
class WidgetManager final {
 public:
  // Room for the types the dashboard composes today plus the ones the roadmap
  // still owes it. The table is assembled once at startup, so an unused slot
  // costs one empty descriptor.
  static constexpr std::size_t kMaximumWidgetTypes = 16;

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
  // The registered types, in the order they were added — which is the order a
  // parent has to be settled in before what it holds. A caller that walks the
  // pools has to walk them in this order rather than in the contract's, so this
  // is what it walks.
  [[nodiscard]] std::size_t type_count() const { return count_; }
  [[nodiscard]] configuration::WidgetType type_at(std::size_t index) const;
  // Reconciles one type's pool with a replacement document. A type the previous
  // document had no widgets of was never created, and creating it is part of
  // this: an empty pool is the same thing as one that has yet to be extended.
  [[nodiscard]] bool sync_count(configuration::WidgetType type,
                                std::uint8_t count);
  // Wakes every created type that provides a wake entry. LVGL lock held.
  void wake_all() const;

 private:
  struct Entry {
    WidgetDescriptor descriptor{};
    bool created{};
  };

  std::array<Entry, kMaximumWidgetTypes> entries_{};
  std::size_t count_{};
};

}  // namespace simcore::dashboard
