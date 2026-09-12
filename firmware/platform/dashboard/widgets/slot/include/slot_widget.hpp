#pragma once

#include <array>
#include <cstddef>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "lvgl_types.hpp"
#include "widget_frame.hpp"

namespace pitrig::dashboard::slot_widget {

inline constexpr std::size_t kMaximumInstances = configuration::kMaximumSlotWidgets;

inline constexpr std::size_t kMaximumPages = kMaximumInstances * configuration::kMaximumSlotPages;

using Config = configuration::SlotWidgetConfiguration;

class Collection final {
 public:
  Collection() = default;
  ~Collection();
  Collection(const Collection&) = delete;
  Collection& operator=(const Collection&) = delete;

  [[nodiscard]] bool create(const Layout& layout, std::span<const Config> configurations,
                            const fonts::Registry& fonts, std::span<lv_obj_t*> pages);
  [[nodiscard]] bool update(std::size_t index, const Layout& layout, const Config& configuration,
                            const fonts::Registry& fonts, std::span<lv_obj_t*> pages);
  [[nodiscard]] lv_obj_t* root_object(std::size_t index) const {
    return index < count_ ? states_[index].box.container : nullptr;
  }
  [[nodiscard]] lv_obj_t* caption_object(std::size_t index) const {
    return index < count_ ? states_[index].box.caption : nullptr;
  }
  [[nodiscard]] std::size_t instance_count() const { return count_; }
  [[nodiscard]] bool extend_to(std::size_t count);
  [[nodiscard]] bool shrink_to(std::size_t count);
  void destroy();

 private:
  struct State {
    frame::Box box{};
    std::uint8_t page_count{};
  };

  void clear_objects();
  void release(State& state, std::size_t index);
  [[nodiscard]] bool build(State& state, std::size_t index, const Layout& layout,
                           const Config& configuration, const fonts::Registry& fonts);
  [[nodiscard]] bool place_pages(State& state, std::size_t index, const Config& configuration,
                                 const Rect& bounds, bool create_objects);

  std::span<lv_obj_t*> pages_{};

  std::array<State, kMaximumInstances> states_{};
  std::size_t count_{};
  bool created_{};
};

}
