#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>

#include "lvgl.h"

namespace simcore::dashboard::frame {

[[nodiscard]] bool lock_lvgl();
void unlock_lvgl();

inline constexpr std::uint32_t kRenderPeriodMs = LV_DEF_REFR_PERIOD;

template <typename Derived, typename State, std::size_t Capacity>
class Collection {
 public:
  Collection() = default;
  ~Collection() { destroy(); }

  Collection(const Collection&) = delete;
  Collection& operator=(const Collection&) = delete;

  [[nodiscard]] lv_obj_t* root_object(const std::size_t index) const {
    return index < count_ ? states_[index].container : nullptr;
  }

  [[nodiscard]] std::size_t instance_count() const { return count_; }

  [[nodiscard]] bool extend_to(const std::size_t count) {
    if (count > states_.size() || count < count_) {
      return false;
    }
    if (!lock_lvgl()) {
      return false;
    }
    created_ = true;
    count_ = count;
    const bool timed =
        count_ == 0 || timer_ != nullptr ||
        (timer_ = lv_timer_create(&update, kRenderPeriodMs, this)) != nullptr;
    unlock_lvgl();
    return timed;
  }

  [[nodiscard]] bool shrink_to(const std::size_t count) {
    if (count > count_) {
      return false;
    }
    if (!created_ || !lock_lvgl()) {
      return false;
    }
    while (count_ > count) {
      --count_;
      derived().on_released(count_);
      release(states_[count_]);
    }
    if (count_ == 0 && timer_ != nullptr) {
      lv_timer_delete(timer_);
      timer_ = nullptr;
    }
    unlock_lvgl();
    return true;
  }

  void destroy() {
    if (!created_ || !lock_lvgl()) {
      return;
    }
    clear_objects();
    unlock_lvgl();
  }

  void wake() {
    if (timer_ != nullptr) {
      lv_timer_ready(timer_);
    }
  }

 protected:
  template <typename BuildOne>
  [[nodiscard]] bool build_all(const std::size_t count, BuildOne&& build_one) {
    if (count > states_.size() || created_ || !lock_lvgl()) {
      return false;
    }
    created_ = true;
    for (std::size_t index = 0; index < count; ++index) {
      if (!build_one(states_[count_], index)) {
        clear_objects();
        created_ = false;
        unlock_lvgl();
        return false;
      }
      ++count_;
    }
    render();
    if (count_ > 0) {
      timer_ = lv_timer_create(&update, kRenderPeriodMs, this);
      if (timer_ == nullptr) {
        clear_objects();
        created_ = false;
        unlock_lvgl();
        return false;
      }
    }
    unlock_lvgl();
    return true;
  }

  template <typename BuildOne>
  [[nodiscard]] bool rebuild_one(const std::size_t index,
                                 BuildOne&& build_one) {
    if (!created_ || index >= count_ || !lock_lvgl()) {
      return false;
    }
    State& state = states_[index];
    release(state);
    const bool built = build_one(state);
    if (built) {
      derived().render_state(state);
    } else {
      release(state);
    }
    unlock_lvgl();
    return built;
  }

  template <typename Apply>
  [[nodiscard]] bool update_one(const std::size_t index, Apply&& apply) {
    if (!created_ || index >= count_ || !lock_lvgl()) {
      return false;
    }
    State& state = states_[index];
    const bool applied = apply(state);
    if (applied) {
      derived().render_state(state);
    }
    unlock_lvgl();
    return applied;
  }

  void render() {
    if (!created_) {
      return;
    }
    for (std::size_t index = 0; index < count_; ++index) {
      if (states_[index].container == nullptr) {
        continue;
      }
      derived().render_state(states_[index]);
    }
  }

  void render_state(State& state) { state.painter.render(); }

  void on_released(std::size_t) {}

  static void release(State& state) {
    state.painter.release();
    if (state.container != nullptr) {
      lv_obj_delete(state.container);
    }
    std::destroy_at(&state);
    std::construct_at(&state);
  }

  void clear_objects() {
    if (timer_ != nullptr) {
      lv_timer_delete(timer_);
      timer_ = nullptr;
    }
    for (std::size_t index = count_; index > 0; --index) {
      derived().on_released(index - 1);
      release(states_[index - 1]);
    }
    count_ = 0;
    created_ = false;
  }

  std::array<State, Capacity> states_{};
  std::size_t count_{};
  lv_timer_t* timer_{};
  bool created_{};

 private:
  [[nodiscard]] Derived& derived() { return static_cast<Derived&>(*this); }

  static void update(lv_timer_t* const timer) {
    auto* const collection =
        static_cast<Collection*>(lv_timer_get_user_data(timer));
    if (collection != nullptr) {
      collection->render();
    }
  }
};

}
