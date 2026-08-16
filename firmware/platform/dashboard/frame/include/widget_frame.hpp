#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"
#include "telemetry_types.hpp"
#include "widget_conditions.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::dashboard::frame {

using Config = configuration::WidgetFrame;
using ValueReadCallback = telemetry::TelemetryRead (*)(void* context);

// Objects that belong to a widget without living inside its container. The text
// widget's caption sits on the parent so the border can pass behind it, and it
// still has to appear and disappear with the widget.
inline constexpr std::size_t kMaximumAttachments = 2;

// The container a widget draws inside, plus the child that carries the
// background when the frame keeps its border clear.
struct Box {
  lv_obj_t* container{};
  lv_obj_t* background_fill{};
};

// Creates the box for one widget: placement, border, radius, padding and the
// background, inset from the frame when the configuration asks for it.
// `content_*` is the smallest size the widget's own content needs; the frame
// adds its own insets before resolving the placement. Logs what the widget
// would have taken when it does not fit.
[[nodiscard]] bool build(const Layout& layout, const Config& config,
                         const char* tag, std::int32_t content_width,
                         std::int32_t content_height,
                         bool fill_available_width, lv_obj_t*& parent,
                         Rect& bounds, Box& box);

// Owns the conditional appearance of one widget: which rule applies, how long
// it outlives the match that raised it, and the blink phase. LVGL is touched
// only where the resolved appearance differs from what is on screen, so a
// widget with no rules costs one comparison per render pass.
// What a rule's value colour means is the widget's own business: text paints a
// label, a bar paints its fill. The frame resolves the colour and hands it back
// through this, the way module and widget descriptors carry their context.
using ApplyContentColor = void (*)(void* context, std::uint32_t rgb);

class Painter {
 public:
  // `attachments` follow the widget's visibility. `content_color` is the
  // authored colour a rule falls back to, and `apply_color` puts a resolved one
  // wherever this widget type shows it.
  void configure(const Config& config, const Box& box,
                 std::span<lv_obj_t* const> attachments,
                 std::uint32_t content_color, ApplyContentColor apply_color,
                 void* color_context);
  // An object painted with the widget's background so it can mask something
  // behind it; it follows a rule that repaints the background.
  void set_background_mask(lv_obj_t* object, std::uint32_t fallback_rgb);
  void bind(ValueReadCallback read, void* context);
  void render();
  void release();

 private:
  void apply_style(const conditions::ResolvedStyle& style);
  void apply_blink();
  void apply_visibility();

  std::array<configuration::WidgetCondition,
             configuration::kMaximumWidgetConditions>
      conditions_{};
  std::size_t condition_count_{};
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
  lv_obj_t* background_mask_{};
  std::uint32_t background_mask_rgb_{};
  ApplyContentColor apply_color_{};
  void* color_context_{};
};

}  // namespace simcore::dashboard::frame
