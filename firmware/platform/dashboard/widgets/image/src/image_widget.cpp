#include "image_widget.hpp"

#include <algorithm>
#include <cmath>
#include <optional>

#include "esp_lvgl_port.h"
#include "image_asset_types.hpp"
#include "logger.hpp"
#include "lvgl.h"
#include "widget_conditions.hpp"

namespace simcore::dashboard::image_widget {
namespace {

constexpr char kTag[] = "image_widget";

constexpr std::uint32_t kAlphaOnlyColor = 0xFFFFFFU;

void apply_recolor(void* const context, const std::uint32_t rgb) {
  const State& state = *static_cast<const State*>(context);
  const bool authored = rgb == state.authored_color;
  lv_obj_set_style_image_recolor(state.image, lv_color_hex(rgb), LV_PART_MAIN);
  lv_obj_set_style_image_recolor_opa(
      state.image, authored ? state.authored_opa : state.rule_opa,
      LV_PART_MAIN);
}

}

bool Binder::bind(const std::span<const Config> configurations,
                  const telemetry::ITelemetryRegistry& registry,
                  const telemetry::ITelemetryReader& telemetry,
                  const frame::ModifierReaders& modifier_readers) {
  count_ = 0;
  if (configurations.size() > bindings_.size()) {
    return false;
  }
  for (const Config& configuration : configurations) {
    frame::ValueBinding binding{};
    bool frame_fast{};
    if (configuration.sprite_frame_source_present &&
        !frame::bind_source(configuration::value_binding_view(
                                configuration.sprite_frame_source.binding),
                            configuration.sprite_frame_source.modifier_count,
                            configuration.sprite_frame_source.modifiers,
                            registry, telemetry, modifier_readers,
                            frame_contexts_[count_], binding.read,
                            binding.read_context, frame_fast)) {
      count_ = 0;
      return false;
    }
    const configuration::WidgetFrame& widget_frame = configuration.frame;
    bool condition_fast{};
    if (widget_frame.condition_count > 0 &&
        !frame::bind_source(configuration::value_binding_view(
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

bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const frame::ValueBinding& binding,
                       const fonts::Registry& fonts,
                       const images::Registry& images) {
  const images::Sheet* const sheet = images.resolve(config.image);
  if (sheet == nullptr) {
    log::error(kTag, "Image '%s' is not installed",
               image_assets::image_id_view(config.image).data());
    return false;
  }
  if (config.sprite_frame >= sheet->frame_count) {
    log::error(kTag, "Image '%s' has no frame %u",
               image_assets::image_id_view(config.image).data(),
               static_cast<unsigned>(config.sprite_frame));
    return false;
  }
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.image = lv_image_create(box.container);
  lv_obj_remove_style_all(state.image);
  lv_obj_center(state.image);
  lv_obj_remove_flag(state.image, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(state.image, LV_OBJ_FLAG_CLICKABLE);
  state.descriptor = sheet->descriptor;
  state.frames = static_cast<const std::uint8_t*>(sheet->descriptor.data);
  state.frame_stride = sheet->frame_stride;
  state.frame_count = sheet->frame_count;
  state.frame_read = config.sprite_frame_source_present ? binding.read : nullptr;
  state.frame_context =
      config.sprite_frame_source_present ? binding.read_context : nullptr;
  state.rendered_frame = config.sprite_frame;
  state.rendered_revision = 0;
  state.initialized = false;
  state.descriptor.data = state.frames + state.rendered_frame * state.frame_stride;
  lv_image_set_src(state.image, &state.descriptor);
  const bool recolored = config.recolor != configuration::kTransparentColor;
  const bool alpha_only = state.descriptor.header.cf == LV_COLOR_FORMAT_A8;
  state.authored_color =
      recolored ? config.recolor
                : (alpha_only ? kAlphaOnlyColor : config.frame.border.color);
  state.authored_opa = recolored || alpha_only ? config.recolor_opa : 0;
  state.rule_opa = config.recolor_opa;
  lv_obj_set_style_image_recolor(
      state.image, lv_color_hex(state.authored_color), LV_PART_MAIN);
  lv_obj_set_style_image_recolor_opa(state.image, state.authored_opa,
                                     LV_PART_MAIN);

  state.painter.configure(config.frame, box, state.authored_color,
                          &apply_recolor, &state);
  state.painter.bind(binding.condition_read, binding.condition_context);
  return true;
}

void Collection::render_state(State& state) {
  state.painter.render();
  if (state.frame_read == nullptr) {
    return;
  }
  const telemetry::TelemetryRead value = state.frame_read(state.frame_context);
  const bool first_render = !state.initialized;
  if (!first_render && value.revision == state.rendered_revision) {
    return;
  }
  state.rendered_revision = value.revision;
  state.initialized = true;

  const std::optional<double> numeric = conditions::condition_value(value);
  if (!numeric.has_value()) {
    return;
  }
  const double rounded = std::round(*numeric);
  const std::size_t frame =
      rounded <= 0.0 ? 0
                     : std::min(static_cast<std::size_t>(rounded),
                                state.frame_count - 1);
  if (frame == state.rendered_frame && !first_render) {
    return;
  }
  state.rendered_frame = frame;
  state.descriptor.data = state.frames + frame * state.frame_stride;
  lv_obj_invalidate(state.image);
}

bool Collection::create(const Layout& layout,
                        const std::span<const Config> configurations,
                        const std::span<const frame::ValueBinding> bindings,
                        const fonts::Registry& fonts,
                        const images::Registry& images) {
  if (layout.display == nullptr || bindings.size() != configurations.size()) {
    return false;
  }
  return build_all(configurations.size(),
                   [&](State& state, const std::size_t index) {
                     return build(state, layout, configurations[index],
                                  bindings[index], fonts, images);
                   });
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration,
                          const frame::ValueBinding& binding,
                          const fonts::Registry& fonts,
                          const images::Registry& images) {
  return rebuild_one(index, [&](State& state) {
    return build(state, layout, configuration, binding, fonts, images);
  });
}

}
