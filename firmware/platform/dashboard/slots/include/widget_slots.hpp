#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "widget_frame.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;
struct _lv_event_t;
using lv_event_t = _lv_event_t;

namespace simcore::dashboard::slots {

// Decides which page of each slot is on screen. A slot's pages share its box and
// exactly one is visible; two things select which.
//
// A tap steps through the pages that are in the loop, and that choice is
// remembered. A page whose trigger fires is raised over the loop for its
// duration and then hands the slot straight back to the loop page that was
// showing, so a momentary event is readable without costing the driver the view
// they chose. While an event is up the tap does nothing: the event is the more
// urgent thing to look at, and dismissing it would only fight a trigger that is
// still holding.
//
// Only pages are hidden, never the widgets inside them, so nothing here writes
// the same LVGL flag a styling rule does.
class Controller final {
 public:
  Controller() = default;
  ~Controller();
  Controller(const Controller&) = delete;
  Controller& operator=(const Controller&) = delete;

  // Registers one slot and binds the source each of its pages watches. Called
  // with the LVGL lock held, once per slot, before start(). `pages` is that
  // slot's own span of page objects, in page order.
  [[nodiscard]] bool add(lv_obj_t* container,
                         std::span<lv_obj_t* const> pages,
                         const configuration::SlotWidgetConfiguration& config,
                         const telemetry::ITelemetryRegistry& registry,
                         const telemetry::ITelemetryReader& telemetry,
                         const frame::ModifierReaders& modifier_readers);

  // Applies the starting selection, makes each slot clickable, and starts
  // evaluating triggers. LVGL lock held.
  [[nodiscard]] bool start();

  // Releases the timer and forgets every slot. LVGL lock held. The objects
  // themselves belong to the composition.
  void clear();

 private:
  struct Page {
    lv_obj_t* object{};
    bool in_loop{};
    configuration::SlotTrigger trigger{};
    std::uint8_t condition_count{};
    std::array<configuration::SlotCondition,
               configuration::kMaximumWidgetConditions>
        conditions{};
    frame::SourceContext source{};
    frame::ValueReadCallback read{};
    void* read_context{};
    std::uint16_t duration_ms{};
    // Last value this page's trigger saw, so a change can be recognised as one.
    double last_value{};
    bool has_last{};
    // When the current event was raised, as an LVGL tick to elapse from rather
    // than a deadline to reach, so the 32-bit tick wrap is not a stuck page.
    std::uint32_t started{};
    bool event_active{};
  };

  struct Slot {
    lv_obj_t* container{};
    std::uint8_t first_page{};
    std::uint8_t page_count{};
    // Page the tap last selected, absolute in pages_. Seeded with the first
    // page in the loop, which is what a slot shows before anything is tapped.
    std::uint8_t loop_page{};
  };

  static void evaluate(lv_timer_t* timer);
  static void on_click(lv_event_t* event);

  static constexpr std::uint8_t kNoPage = 0xFF;

  void refresh();
  void advance(std::size_t index);
  // Updates one page's event state from its trigger and reports whether it is
  // raised. Not const: the change trigger and the duration both latch here,
  // which is what keeps the resolver a pure function of value and rules.
  [[nodiscard]] bool raised(Page& page);
  [[nodiscard]] std::uint8_t selection(const Slot& slot);

  std::array<Slot, configuration::kMaximumSlotWidgets> slots_{};
  std::size_t count_{};
  std::array<Page, configuration::kMaximumSlotWidgets *
                       configuration::kMaximumSlotPages>
      pages_{};
  std::size_t page_count_{};
  lv_timer_t* timer_{};
};

}  // namespace simcore::dashboard::slots
