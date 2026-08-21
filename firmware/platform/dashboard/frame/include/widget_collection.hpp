#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>

#include "lvgl.h"

namespace simcore::dashboard::frame {

// The LVGL port lock, behind a declaration rather than its header: this file
// crosses the component boundary and esp_lvgl_port is private to the dashboard.
[[nodiscard]] bool lock_lvgl();
void unlock_lvgl();

// Telemetry changes wake the render timer early through the dashboard's render
// trigger, so this is the fallback poll and the blink cadence.
inline constexpr std::uint32_t kRenderPeriodMs = LV_DEF_REFR_PERIOD;

// The lifecycle every widget type's instance pool shares: bounded typed
// storage, one render timer for the whole pool, and the create / roll back /
// tear down ordering around the LVGL lock.
//
// Only three things actually differ between widget types — how one instance is
// built, how one instance is drawn, and what `create` needs to be handed to do
// it — so those stay with the type and everything else lives here. The type
// derives from this and supplies `render_state(State&)`; its own `create`
// keeps whatever signature it needs and calls `build_all` with a builder.
//
// A widget type that gets this wrong gets it wrong in a way that only shows up
// when a configuration is replaced at runtime, which is why the ordering is in
// one place rather than copied per type.
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

  void destroy() {
    if (!created_ || !lock_lvgl()) {
      return;
    }
    clear_objects();
    unlock_lvgl();
  }

  // Marks the shared render timer ready so the next LVGL pass re-reads every
  // source instead of waiting for the period to elapse. Caller holds the LVGL
  // lock. A no-op while no instances exist.
  void wake() {
    if (timer_ != nullptr) {
      lv_timer_ready(timer_);
    }
  }

 protected:
  // Builds `count` instances and starts the pool's render timer, or leaves the
  // pool empty. `build_one(State&, index)` returns false to fail the whole
  // create, which rolls back every instance built so far rather than leaving a
  // half-populated pool behind.
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

  // Rebuilds one instance in place, leaving its siblings and the shared render
  // timer untouched. Used when a configuration replacement changed only this
  // instance. Returns false if it cannot be built, in which case its slot is
  // left empty rather than half-built.
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

  void render() {
    if (!created_) {
      return;
    }
    for (std::size_t index = 0; index < count_; ++index) {
      derived().render_state(states_[index]);
    }
  }

  // Drawing one instance. A type with nothing to draw beyond its frame — an
  // image, a container shape — inherits this; the rest declare their own,
  // which hides it.
  void render_state(State& state) { state.painter.render(); }

  // Called as each instance is released, for a type that publishes its objects
  // somewhere else and has to retract them too.
  void on_released(std::size_t) {}

  static void release(State& state) {
    state.painter.release();
    if (state.container != nullptr) {
      lv_obj_delete(state.container);
    }
    // Reconstructed in place rather than assigned from `State{}`. A widget's
    // state carries non-zero defaults — the conditions the painter holds are
    // kTransparentColor — so a temporary is a real object the compiler builds
    // on the stack and copies over, and the frame it needs is the size of the
    // whole state. This runs on the configuration task while a replacement is
    // being applied, whose stack is a few kilobytes: a state large enough to
    // hold a graph's traces overflowed it there, and every type was paying the
    // same cost in proportion to its own size.
    std::destroy_at(&state);
    std::construct_at(&state);
  }

  void clear_objects() {
    if (timer_ != nullptr) {
      lv_timer_delete(timer_);
      timer_ = nullptr;
    }
    // Deepest first. A type whose instances nest — a container shape — is
    // ordered parent-before-child in its pool, and deleting an LVGL object
    // deletes its descendants, so releasing forward would delete a container
    // and then delete its already-destroyed children a second time. Order is
    // irrelevant for the types that do not nest, so all of them use this one.
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

}  // namespace simcore::dashboard::frame
