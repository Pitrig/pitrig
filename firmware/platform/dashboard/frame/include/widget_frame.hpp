#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_types.hpp"
#include "widget_conditions.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::dashboard::frame {

using Config = configuration::WidgetFrame;
using ValueReadCallback = telemetry::TelemetryRead (*)(void* context);

// A module that replaces a telemetry value behind the pipeline callback.
struct ModifierReader {
  ValueReadCallback read{};
  void* context{};
};

// One reader per ValueModifierType, indexed by the enum value. The composition
// root fills the entry of every module it started and leaves the rest empty, so
// the binding below resolves a modifier by its index and never names a module.
// Adding a modifier type is then an entry there and a value in the schema;
// nothing in this file or in the per-type binders changes.
using ModifierReaders =
    std::array<ModifierReader, configuration::kValueModifierTypeNames.size()>;

// The reader a modifier type resolves to, or an empty one when the type is out
// of range. Empty fails the bind, which is what an authored modifier whose
// module did not start has always done.
[[nodiscard]] inline ModifierReader modifier_reader(
    const ModifierReaders& readers,
    const configuration::ValueModifierType type) {
  const auto index = static_cast<std::size_t>(type);
  return index < readers.size() ? readers[index] : ModifierReader{};
}

// Telemetry read context, owned by the widget type that binds the source. It is
// deliberately not a pointer into the configuration document, so a replacement
// cannot leave a widget reading stale storage.
struct SourceContext {
  const telemetry::ITelemetryReader* telemetry{};
  telemetry::Handle handle{};
};

// Resolves one canonical name plus its modifiers into a read callback. Every
// widget type binds through this, whether the source drives what it draws or
// only what its rules watch.
[[nodiscard]] bool bind_source(
    std::string_view name, std::uint8_t modifier_count,
    std::span<const configuration::ValueModifier> modifiers,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReaders& modifier_readers, SourceContext& context,
    ValueReadCallback& read, void*& read_context, bool& fast_updates);

// One widget's resolved sources: the value it draws and the source its rules
// watch. Widgets that draw a single value all bind exactly this pair.
struct ValueBinding {
  ValueReadCallback read{};
  void* read_context{};
  bool fast_updates{};
  ValueReadCallback condition_read{};
  void* condition_context{};
};

// Binds the value source and the condition source of every widget of one type.
template <typename WidgetConfig, std::size_t Capacity>
class ValueBinder final {
 public:
  [[nodiscard]] bool bind(const std::span<const WidgetConfig> configurations,
                          const telemetry::ITelemetryRegistry& registry,
                          const telemetry::ITelemetryReader& telemetry,
                          const ModifierReaders& modifier_readers) {
    count_ = 0;
    if (configurations.size() > bindings_.size()) {
      return false;
    }
    for (const WidgetConfig& configuration : configurations) {
      ValueBinding binding{};
      if (!bind_source(
              configuration::value_binding_view(configuration.source.binding),
              configuration.source.modifier_count,
              configuration.source.modifiers, registry, telemetry,
              modifier_readers, value_contexts_[count_], binding.read,
              binding.read_context, binding.fast_updates)) {
        count_ = 0;
        return false;
      }
      const configuration::WidgetFrame& widget_frame = configuration.frame;
      bool condition_fast{};
      if (widget_frame.condition_count > 0 &&
          !bind_source(configuration::value_binding_view(
                           widget_frame.condition_source.binding),
                       widget_frame.condition_source.modifier_count,
                       widget_frame.condition_source.modifiers, registry,
                       telemetry, modifier_readers,
                       condition_contexts_[count_], binding.condition_read,
                       binding.condition_context, condition_fast)) {
        count_ = 0;
        return false;
      }
      bindings_[count_] = binding;
      ++count_;
    }
    return true;
  }

  [[nodiscard]] std::span<const ValueBinding> bindings() const {
    return {bindings_.data(), count_};
  }

 private:
  std::array<SourceContext, Capacity> value_contexts_{};
  std::array<SourceContext, Capacity> condition_contexts_{};
  std::array<ValueBinding, Capacity> bindings_{};
  std::size_t count_{};
};

// Binds the condition source of every widget of one type. A widget that draws
// no telemetry of its own still needs this, because its rules do.
template <typename WidgetConfig, std::size_t Capacity>
class ConditionBinder final {
 public:
  [[nodiscard]] bool bind(const std::span<const WidgetConfig> configurations,
                          const telemetry::ITelemetryRegistry& registry,
                          const telemetry::ITelemetryReader& telemetry,
                          const ModifierReaders& modifier_readers) {
    count_ = 0;
    if (configurations.size() > reads_.size()) {
      return false;
    }
    for (const WidgetConfig& configuration : configurations) {
      ValueReadCallback read{};
      void* read_context{};
      bool fast_updates{};
      const configuration::WidgetFrame& widget_frame = configuration.frame;
      if (widget_frame.condition_count > 0 &&
          !bind_source(configuration::value_binding_view(
                           widget_frame.condition_source.binding),
                       widget_frame.condition_source.modifier_count,
                       widget_frame.condition_source.modifiers, registry,
                       telemetry, modifier_readers, contexts_[count_], read,
                       read_context, fast_updates)) {
        count_ = 0;
        return false;
      }
      reads_[count_] = read;
      read_contexts_[count_] = read_context;
      ++count_;
    }
    return true;
  }

  [[nodiscard]] std::span<const ValueReadCallback> reads() const {
    return {reads_.data(), count_};
  }
  [[nodiscard]] std::span<void* const> contexts() const {
    return {read_contexts_.data(), count_};
  }

 private:
  std::array<SourceContext, Capacity> contexts_{};
  std::array<ValueReadCallback, Capacity> reads_{};
  std::array<void*, Capacity> read_contexts_{};
  std::size_t count_{};
};

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
