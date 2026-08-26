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
using WidgetRootObject = lv_obj_t* (*)(void* context, std::uint8_t index);
using WidgetUpdateInstance = bool (*)(void* context, std::uint8_t index);
using WidgetSyncCount = bool (*)(void* context, std::uint8_t count);
using WidgetWake = void (*)(void* context);

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

class WidgetManager final {
 public:
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
  [[nodiscard]] std::size_t type_count() const { return count_; }
  [[nodiscard]] configuration::WidgetType type_at(std::size_t index) const;
  [[nodiscard]] bool sync_count(configuration::WidgetType type,
                                std::uint8_t count);
  void wake_all() const;

 private:
  struct Entry {
    WidgetDescriptor descriptor{};
    bool created{};
  };

  std::array<Entry, kMaximumWidgetTypes> entries_{};
  std::size_t count_{};
};

}
