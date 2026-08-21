#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "widget_conditions.hpp"
#include "widget_source_binding.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::dashboard::frame {

using Config = configuration::WidgetFrame;

// The caption and its mask sit on the parent rather than inside the container,
// so the border can pass behind them; they still appear and disappear with the
// widget, which is what these slots are for.
inline constexpr std::size_t kMaximumAttachments = 2;

// The container a widget draws inside, the child that carries the background
// when the frame keeps its border clear, and the caption that breaks the border.
struct Box {
  lv_obj_t* container{};
  lv_obj_t* background_fill{};
  lv_obj_t* caption{};
  lv_obj_t* caption_gap{};
  // Line height of the caption, so a widget can leave room for it. Zero when
  // the frame carries no title.
  std::int32_t caption_height{};
};

// Whether a caption's mask has to resolve the colour behind the widget rather
// than copy the widget's own fill. A mask copies the fill only when the
// container itself paints it: a transparent colour paints nothing, and an inset
// background leaves the frame line standing on the parent.
//
// The incremental apply pass has to answer the same question — a screen
// recolour reaches a widget only through a mask that reads the parent — so the
// rule is stated here once instead of being mirrored there, where it had
// drifted out of sight of the code it describes.
[[nodiscard]] bool caption_mask_reads_parent(const Config& config);

// Creates the box for one widget: placement, border, radius, padding and the
// background, inset from the frame when the configuration asks for it.
// `content_*` is the smallest size the widget's own content needs; the frame
// adds its own insets before resolving the placement. Logs what the widget
// would have taken when it does not fit.
[[nodiscard]] bool build(const Layout& layout, const Config& config,
                         const char* tag, std::int32_t content_width,
                         std::int32_t content_height,
                         bool fill_available_width, const fonts::Registry& fonts,
                         lv_obj_t*& parent, Rect& bounds, Box& box);

// Re-resolves an existing box against a replacement configuration, keeping the
// objects it is already made of. This is what a container is updated through: a
// widget parented to it is an LVGL child, and deleting the container deletes
// its children with it — children another collection owns and still points at.
//
// Answers false, having written nothing, when the difference is not a restyle
// at all: a widget whose parent changed, or whose inset background appears or
// disappears. Its caller falls back to a full composition, which can rebuild
// what this cannot. The caption and its mask are replaced rather than restyled,
// so the caller releases the ones it held after this returns.
// `bounds` receives the box it resolved, for a type that has to place something
// of its own inside it — a slot's pages. Optional, because most types read what
// they need back off the objects.
[[nodiscard]] bool update(const Layout& layout, const Config& config,
                          const char* tag, std::int32_t content_width,
                          std::int32_t content_height,
                          bool fill_available_width,
                          const fonts::Registry& fonts, Box& box,
                          Rect* bounds = nullptr);

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
  // The caption and its mask follow the widget's visibility, and the mask also
  // follows a rule that repaints the background, so the box supplies both.
  // `content_color` is the authored colour a rule falls back to, and
  // `apply_color` puts a resolved one wherever this widget type shows it.
  void configure(const Config& config, const Box& box,
                 std::uint32_t content_color, ApplyContentColor apply_color,
                 void* color_context);
  void bind(ValueReadCallback read, void* context);
  void render();
  void release();

 private:
  [[nodiscard]] conditions::ResolvedStyle ramped(
      std::optional<double> value) const;
  void apply_style(const conditions::ResolvedStyle& style);
  void apply_blink();
  void apply_visibility();

  std::array<configuration::WidgetCondition,
             configuration::kMaximumWidgetConditions>
      conditions_{};
  std::size_t condition_count_{};
  // The ramp is the layer under the rules: it replaces the colour they fall
  // back to, so a rule that matches still wins and one that does not leaves a
  // colour that moved with the value.
  std::array<configuration::ColorStop, configuration::kMaximumColorStops>
      ramp_stops_{};
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
  lv_obj_t* background_mask_{};
  std::uint32_t background_mask_rgb_{};
  ApplyContentColor apply_color_{};
  void* color_context_{};
};

}  // namespace simcore::dashboard::frame
