#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "dashboard_layout.hpp"
#include "telemetry_registry.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::dashboard::text_widget {

inline constexpr std::size_t kMaximumInstances = 16;
inline constexpr std::size_t kTitleCapacity = 16;
inline constexpr std::size_t kUnavailableTextCapacity = 16;

struct BoundConfig;

enum class Alignment : std::uint8_t {
  left,
  center,
  right,
};

struct Border {
  std::uint32_t color{0xAEAEAE};
  std::uint16_t width_px{};
  std::uint16_t radius_px{};
};

struct TitleStyle {
  std::array<char, kTitleCapacity> text{};
  FontSpec font{.family = kMontserratFontFamily, .size_px = 10};
  std::uint32_t color{0xE8E8E8};
  std::int16_t offset_y_px{};
};

struct ValueStyle {
  FontSpec font{.family = kMontserratFontFamily, .size_px = 48};
  std::uint32_t color{0xE8E8E8};
  Alignment alignment{Alignment::center};
  std::array<char, kUnavailableTextCapacity> unavailable_text{
      '-', '-', '\0'};
};

struct Config {
  telemetry::FieldName binding{
      telemetry::make_field_name(telemetry::fields::kSpeed)};
  Placement placement{};
  Insets padding{};
  Border border{};
  TitleStyle title{};
  ValueStyle value{};
  std::uint32_t background_color{kTransparentColor};
};

// Owns the fixed runtime state for every configured text widget. All instances
// share one render timer and read only their pre-bound telemetry handles.
class Collection final {
 public:
  Collection() = default;
  Collection(const Collection&) = delete;
  Collection& operator=(const Collection&) = delete;

  [[nodiscard]] bool create(
      const Layout& layout, std::span<const BoundConfig> configurations,
      const telemetry::ITelemetryReader& telemetry);

 private:
  struct State {
    telemetry::Handle binding{};
    lv_obj_t* container{};
    lv_obj_t* caption_gap{};
    lv_obj_t* caption{};
    lv_obj_t* value_label{};
    std::array<char, telemetry::kTelemetryTextCapacity> unavailable_text{};
    std::array<char, telemetry::kTelemetryTextCapacity> displayed_text{};
    bool initialized{};
  };

  static void update(lv_timer_t* timer);
  void render();
  void clear_objects();

  const telemetry::ITelemetryReader* telemetry_{};
  std::array<State, kMaximumInstances> states_{};
  std::size_t count_{};
  lv_timer_t* timer_{};
};

}  // namespace simcore::dashboard::text_widget
