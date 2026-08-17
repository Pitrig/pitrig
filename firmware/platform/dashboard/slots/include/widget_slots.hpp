#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#include "application_configuration.hpp"
#include "widget_frame.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;
struct _lv_event_t;
using lv_event_t = _lv_event_t;

namespace simcore::dashboard::slots {

// Container shapes that share a slot share a box, and exactly one is visible.
// Two things select which: a rule over telemetry, and a tap on the slot.
//
// Telemetry wins while it matches, which is the model conditional styling
// already uses — a dashboard cannot latch into a state its telemetry has left
// behind. With nothing matching, the slot shows whatever the driver last
// tapped, or the authored default before any tap.
//
// Only shapes that are in a slot are registered. A plain container never hides
// and never takes a tap, so a member entry spent on one would buy nothing.
class Controller final {
 public:
  static constexpr std::size_t kMaximumMembers =
      configuration::kMaximumShapeWidgets;

  Controller() = default;
  ~Controller();
  Controller(const Controller&) = delete;
  Controller& operator=(const Controller&) = delete;

  // Registers one container shape and binds the source its slot rules watch.
  // Called with the LVGL lock held, once per slot member, before start().
  [[nodiscard]] bool add(lv_obj_t* container,
                         const configuration::ShapeWidgetConfiguration& shape,
                         const telemetry::ITelemetryRegistry& registry,
                         const telemetry::ITelemetryReader& telemetry,
                         frame::ModifierReader lap_timer_modifier);

  // Applies the authored selection, makes slot members clickable, and starts
  // evaluating rules. LVGL lock held.
  [[nodiscard]] bool start();

  // Releases the timer and forgets every member. LVGL lock held. The containers
  // themselves belong to the composition.
  void clear();

 private:
  struct Member {
    lv_obj_t* container{};
    // 1..kMaximumSlots. A shape outside a slot is never registered.
    std::uint8_t slot{};
    bool is_default{};
    std::uint8_t condition_count{};
    std::array<configuration::SlotCondition,
               configuration::kMaximumWidgetConditions>
        conditions{};
    frame::SourceContext source{};
    frame::ValueReadCallback read{};
    void* read_context{};
    // Deadline a matched rule's hold expires at, in LVGL ticks.
    std::uint32_t hold_until_ms{};
    bool held{};
  };

  static void evaluate(lv_timer_t* timer);
  static void on_click(lv_event_t* event);

  // Index of the member each slot shows, recomputed from the rules and the last
  // tap. kNoMember while a slot has no members.
  static constexpr std::uint8_t kNoMember = 0xFF;

  void refresh();
  void advance(std::uint8_t slot);
  [[nodiscard]] std::uint8_t selection(std::uint8_t slot);

  std::array<Member, kMaximumMembers> members_{};
  std::size_t count_{};
  std::array<std::uint8_t, configuration::kMaximumSlots> manual_{};
  lv_timer_t* timer_{};
};

}  // namespace simcore::dashboard::slots
