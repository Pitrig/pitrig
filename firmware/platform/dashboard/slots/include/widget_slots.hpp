#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "lvgl_types.hpp"
#include "widget_frame.hpp"

namespace pitrig::dashboard::slots {

class Controller final {
 public:
  Controller() = default;
  ~Controller();
  Controller(const Controller&) = delete;
  Controller& operator=(const Controller&) = delete;

  [[nodiscard]] bool add(lv_obj_t* container, std::span<lv_obj_t* const> pages,
                         const configuration::SlotWidgetConfiguration& config, std::uint8_t index,
                         const telemetry::ITelemetryRegistry& registry,
                         const telemetry::ITelemetryReader& telemetry,
                         const frame::ModifierReaders& modifier_readers);

  [[nodiscard]] bool start();

  void wake();

  void clear();

  void step(std::size_t index, int delta, bool wrap);
  void show(std::size_t index, std::uint8_t page);
  void hold(std::size_t index, std::uint8_t page);
  void release(std::size_t index);
  void dismiss(std::size_t index);
  void new_session();

 private:
  static constexpr std::uint8_t kNoPage = 0xFF;

  struct Page {
    lv_obj_t* object{};
    bool in_loop{};
    configuration::SlotTrigger trigger{};
    std::uint8_t condition_count{};
    std::array<configuration::ValueCondition, configuration::kMaximumWidgetConditions> conditions{};
    frame::SourceContext source{};
    frame::ValueReadCallback read{};
    void* read_context{};
    std::uint16_t duration_ms{};
    double last_value{};
    bool has_last{};
    std::uint32_t started{};
    bool event_active{};
    configuration::SlotDismiss dismiss{};
    std::uint32_t dismiss_ms{};
    std::uint32_t dismissed_at{};
    bool dismissed{};
    bool rearmed{};
  };

  struct Slot {
    lv_obj_t* container{};
    std::uint8_t index{};
    std::uint8_t first_page{};
    std::uint8_t page_count{};
    std::uint8_t loop_page{};
    std::uint8_t home_page{};
    std::uint8_t held_page{kNoPage};
    std::uint32_t home_after_ms{};
    std::uint32_t touched{};
  };

  static void evaluate(lv_timer_t* timer);
  static void on_click(lv_event_t* event);

  void refresh(bool shown_only);
  void advance(std::size_t index);
  [[nodiscard]] bool raised(Page& page);
  [[nodiscard]] bool dismissal_holds(Page& page, bool fires);
  [[nodiscard]] std::uint8_t selection(const Slot& slot);
  [[nodiscard]] Slot* find(std::size_t index);
  [[nodiscard]] bool event_active(const Slot& slot) const;
  void return_home();

  std::array<Slot, configuration::kMaximumSlotWidgets> slots_{};
  std::size_t count_{};
  std::array<Page, configuration::kMaximumSlotWidgets * configuration::kMaximumSlotPages> pages_{};
  std::size_t page_count_{};
  lv_timer_t* timer_{};
};

}
