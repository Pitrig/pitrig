#pragma once

#include <array>
#include <cstddef>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "widget_frame.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::dashboard::slot_widget {

inline constexpr std::size_t kMaximumInstances =
    configuration::kMaximumSlotWidgets;

// Every page of every slot, flat. A page is not a widget and has no pool of its
// own, so a slot's pool index times this capacity is what addresses its pages.
inline constexpr std::size_t kMaximumPages =
    kMaximumInstances * configuration::kMaximumSlotPages;

using Config = configuration::SlotWidgetConfiguration;

// An area of a screen that switches what it shows. A slot draws nothing — the
// validator refuses every property that would paint it — so this collection
// builds one transparent box and one bare object per page inside it, and hands
// both to whoever decides which page is visible. Rendering, telemetry and the
// tap all belong to the slots controller; what lives here is only the objects.
//
// `pages` is how a page reaches the widgets parented to it, written per flat
// page index so a child can resolve its parent by the index its frame carries —
// exactly as a container shape publishes its own box.
class Collection final {
 public:
  Collection() = default;
  ~Collection();
  Collection(const Collection&) = delete;
  Collection& operator=(const Collection&) = delete;

  [[nodiscard]] bool create(const Layout& layout,
                            std::span<const Config> configurations,
                            const fonts::Registry& fonts,
                            std::span<lv_obj_t*> pages);
  // Brings one instance up to a replacement document: the box it stands in and
  // the pages inside it, keeping every object. A slot's pages are the parents of
  // the widgets authored on them and the slots controller points at them, so
  // rebuilding one would take both down. Refuses — having written nothing — a
  // difference that is not a restyle: a page count that changed, or whatever the
  // frame itself refuses.
  //
  // An instance that has no object yet is built rather than restyled, which is
  // how a slot added by a replacement arrives.
  [[nodiscard]] bool update(std::size_t index, const Layout& layout,
                            const Config& configuration,
                            const fonts::Registry& fonts,
                            std::span<lv_obj_t*> pages);
  [[nodiscard]] lv_obj_t* root_object(std::size_t index) const {
    return index < count_ ? states_[index].box.container : nullptr;
  }
  [[nodiscard]] std::size_t instance_count() const { return count_; }
  // The pool primitives the frame collection offers every other type, spelled
  // out here because a slot draws nothing and owns no render timer.
  [[nodiscard]] bool extend_to(std::size_t count);
  [[nodiscard]] bool shrink_to(std::size_t count);
  void destroy();

 private:
  struct State {
    // The whole box rather than the container alone. The frame puts a caption
    // and its mask on the *parent*, and an inset background inside the
    // container; a slot has no painter to own either, so nothing else here
    // would delete them or hand them to an update.
    frame::Box box{};
    std::uint8_t page_count{};
  };

  void clear_objects();
  void release(State& state, std::size_t index);
  [[nodiscard]] bool build(State& state, std::size_t index, const Layout& layout,
                           const Config& configuration,
                           const fonts::Registry& fonts);
  [[nodiscard]] bool place_pages(State& state, std::size_t index,
                                 const Config& configuration,
                                 const Rect& bounds, bool create_objects);

  // Published so a child can find its page, and cleared alongside the object it
  // names so a released page never leaves a stale pointer behind.
  std::span<lv_obj_t*> pages_{};

  std::array<State, kMaximumInstances> states_{};
  std::size_t count_{};
  bool created_{};
};

}  // namespace simcore::dashboard::slot_widget
