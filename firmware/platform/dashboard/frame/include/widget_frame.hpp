#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "lvgl_types.hpp"
#include "value_conditions.hpp"
#include "widget_source_binding.hpp"

namespace pitrig::dashboard::frame {

using Config = configuration::WidgetFrame;

inline constexpr std::size_t kMaximumAttachments = 2;

struct CaptionMask {
  bool present{};
  std::int32_t x{};
  std::int32_t y{};
  std::int32_t width{};
  std::int32_t height{};
  std::uint32_t rgb{};
};

struct CaptionLayout {
  Rect bounds{};
  const lv_font_t* font{};
  configuration::TextAlignment alignment{};
  std::int32_t border_width{};
  std::int16_t offset_x{};
  std::int16_t offset_y{};
  std::uint16_t gap_padding{};
  bool border_gap{};
};

struct Box {
  lv_obj_t* container{};
  lv_obj_t* background_fill{};
  lv_obj_t* caption{};
  CaptionMask caption_mask{};
  CaptionLayout caption_layout{};
  std::int32_t caption_height{};
};

[[nodiscard]] bool caption_mask_reads_parent(const Config& config);

[[nodiscard]] std::uint32_t background_behind(const lv_obj_t* object);

[[nodiscard]] std::int32_t fill_radius(const Config& config, std::int32_t inset);

[[nodiscard]] bool build(const Layout& layout, const Config& config, const char* tag,
                         std::int32_t content_width, std::int32_t content_height,
                         bool fill_available_width, const fonts::Registry& fonts, lv_obj_t*& parent,
                         Rect& bounds, Box& box);

[[nodiscard]] bool update(const Layout& layout, const Config& config, const char* tag,
                          std::int32_t content_width, std::int32_t content_height,
                          bool fill_available_width, const fonts::Registry& fonts, Box& box,
                          Rect* bounds = nullptr);

using ApplyContentColor = void (*)(void* context, std::uint32_t rgb);

class Painter {
 public:
  void configure(const Config& config, const Box& box, std::uint32_t content_color,
                 ApplyContentColor apply_color, void* color_context);
  void bind(ValueReadCallback read, void* context);
  void bind_caption(ValueReadCallback read, void* context);
  void render();
  void release();
  void paint_caption_mask(lv_layer_t* layer) const;
  [[nodiscard]] lv_obj_t* caption_object() const { return box_.caption; }

 private:
  [[nodiscard]] conditions::ResolvedStyle ramped(std::optional<double> value) const;
  void apply_style(const conditions::ResolvedStyle& style);
  void apply_blink();
  void apply_visibility();
  void render_caption();
  void place_caption();

  std::array<configuration::WidgetCondition, configuration::kMaximumWidgetConditions> conditions_{};
  std::size_t condition_count_{};
  std::array<configuration::ColorStop, configuration::kMaximumColorStops> ramp_stops_{};
  std::size_t ramp_stop_count_{};
  configuration::ColorRampTarget ramp_target_{};
  ValueReadCallback read_{};
  void* read_context_{};
  std::uint64_t rendered_revision_{};
  bool rendered_available_{};
  conditions::ResolvedStyle static_style_{};
  conditions::ResolvedStyle applied_style_{};
  conditions::ResolvedStyle held_style_{};
  std::uint32_t hold_started_{};
  std::uint16_t hold_ms_{};
  bool holding_{};
  std::uint32_t blink_started_{};
  bool blink_visible_{true};
  bool visible_{true};
  Box box_{};
  std::array<lv_obj_t*, kMaximumAttachments> attachments_{};
  std::size_t attachment_count_{};
  CaptionMask caption_mask_{};
  std::uint32_t caption_mask_rgb_{};
  CaptionLayout caption_layout_{};
  std::array<char, configuration::kWidgetTitleCapacity> caption_fallback_{};
  std::array<char, telemetry::kTelemetryTextCapacity> caption_text_{};
  ValueReadCallback caption_read_{};
  void* caption_context_{};
  std::uint64_t caption_revision_{};
  bool caption_available_{};
  bool caption_rendered_{};
  ApplyContentColor apply_color_{};
  void* color_context_{};
};

}
