#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "lvgl_types.hpp"
#include "widget_frame.hpp"

namespace simcore::dashboard::slots {

class Controller final {
 public:
  Controller() = default;
  ~Controller();
  Controller(const Controller&) = delete;
  Controller& operator=(const Controller&) = delete;

  [[nodiscard]] bool add(lv_obj_t* container,
                         std::span<lv_obj_t* const> pages,
                         const configuration::SlotWidgetConfiguration& config,
                         const telemetry::ITelemetryRegistry& registry,
                         const telemetry::ITelemetryReader& telemetry,
                         const frame::ModifierReaders& modifier_readers);

  [[nodiscard]] bool start();

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
    double last_value{};
    bool has_last{};
    std::uint32_t started{};
    bool event_active{};
  };

  struct Slot {
    lv_obj_t* container{};
    std::uint8_t first_page{};
    std::uint8_t page_count{};
    std::uint8_t loop_page{};
  };

  static void evaluate(lv_timer_t* timer);
  static void on_click(lv_event_t* event);

  static constexpr std::uint8_t kNoPage = 0xFF;

  void refresh();
  void advance(std::size_t index);
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

}
