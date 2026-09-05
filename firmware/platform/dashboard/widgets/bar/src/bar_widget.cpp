#include "bar_widget.hpp"

#include <algorithm>

#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "value_conditions.hpp"

namespace pitrig::dashboard::bar_widget {
namespace {

constexpr char kTag[] = "bar_widget";

void apply_fill_color(void* const context, const std::uint32_t rgb) {
  lv_obj_set_style_bg_color(static_cast<lv_obj_t*>(context), lv_color_hex(rgb),
                            LV_PART_MAIN);
}

}

bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const frame::ValueBinding& binding,
                       const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.read = binding.read;
  state.read_context = binding.read_context;
  state.range = config.range;
  state.origin_fraction =
      config.origin_present
          ? conditions::range_fraction(config.origin, config.range)
          : 0.0F;
  state.orientation = config.orientation;
  state.inverted = config.inverted;
  state.free_running = binding.fast_updates;

  const std::int32_t border = config.frame.border.width_px;
  state.inner_width = std::max<std::int32_t>(
      bounds.width - 2 * border - config.frame.padding.left -
          config.frame.padding.right,
      0);
  state.inner_height = std::max<std::int32_t>(
      bounds.height - 2 * border - config.frame.padding.top -
          config.frame.padding.bottom,
      0);
  state.origin_x = 0;
  state.origin_y = 0;

  state.fill = lv_obj_create(box.container);
  lv_obj_remove_style_all(state.fill);
  lv_obj_set_style_bg_color(state.fill, lv_color_hex(config.fill_color),
                            LV_PART_MAIN);
  lv_obj_set_style_bg_opa(state.fill, LV_OPA_COVER, LV_PART_MAIN);
  if (config.fill_grad_color != configuration::kTransparentColor) {
    lv_obj_set_style_bg_grad_color(state.fill,
                                   lv_color_hex(config.fill_grad_color),
                                   LV_PART_MAIN);
    lv_obj_set_style_bg_grad_dir(
        state.fill,
        config.orientation == configuration::BarOrientation::horizontal
            ? LV_GRAD_DIR_HOR
            : LV_GRAD_DIR_VER,
        LV_PART_MAIN);
  }
  lv_obj_set_style_radius(state.fill, frame::fill_radius(config.frame, border),
                          LV_PART_MAIN);
  lv_obj_remove_flag(state.fill, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(state.fill, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_pos(state.fill, state.origin_x, state.origin_y);
  lv_obj_set_size(state.fill, 0, 0);
  state.drawn_length = -1;

  state.painter.configure(config.frame, box, config.fill_color,
                          &apply_fill_color, state.fill);
  state.painter.bind(binding.condition_read, binding.condition_context);
  state.painter.bind_caption(binding.caption_read, binding.caption_context);
  return true;
}

bool Collection::create(const Layout& layout,
                        const std::span<const Config> configurations,
                        const std::span<const frame::ValueBinding> bindings,
                        const fonts::Registry& fonts) {
  if (layout.display == nullptr || configurations.size() != bindings.size()) {
    return false;
  }
  return build_all(bindings.size(), [&](State& state, const std::size_t index) {
    return bindings[index].read != nullptr &&
           bindings[index].read_context != nullptr &&
           build(state, layout, configurations[index], bindings[index], fonts);
  });
}

void Collection::render_state(State& state) {
  const telemetry::TelemetryRead value = state.read(state.read_context);
  const bool first_render = !state.initialized;
  const bool changed = first_render || state.free_running ||
                       value.revision != state.rendered_revision ||
                       value.available != state.rendered_available;
  state.rendered_revision = value.revision;
  state.rendered_available = value.available;
  state.painter.render();
  if (!changed) {
    return;
  }
  state.initialized = true;

  const std::optional<double> numeric = conditions::condition_value(value);
  const float fraction =
      numeric.has_value() ? conditions::range_fraction(*numeric, state.range) : 0.0F;
  const bool horizontal =
      state.orientation == configuration::BarOrientation::horizontal;
  const std::int32_t span = horizontal ? state.inner_width : state.inner_height;
  const float nearest = std::min(state.origin_fraction, fraction);
  const float farthest = std::max(state.origin_fraction, fraction);
  const auto offset =
      static_cast<std::int32_t>(static_cast<float>(span) * nearest + 0.5F);
  const auto length =
      static_cast<std::int32_t>(static_cast<float>(span) * farthest + 0.5F) -
      offset;
  if (!first_render && length == state.drawn_length &&
      offset == state.drawn_offset) {
    return;
  }
  state.drawn_length = length;
  state.drawn_offset = offset;

  const bool from_axis_start = horizontal != state.inverted;
  const std::int32_t leading =
      from_axis_start ? offset : span - offset - length;
  if (horizontal) {
    lv_obj_set_pos(state.fill, state.origin_x + leading, state.origin_y);
    lv_obj_set_size(state.fill, length, state.inner_height);
  } else {
    lv_obj_set_pos(state.fill, state.origin_x, state.origin_y + leading);
    lv_obj_set_size(state.fill, state.inner_width, length);
  }
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration,
                          const frame::ValueBinding& binding,
                          const fonts::Registry& fonts) {
  if (binding.read == nullptr || binding.read_context == nullptr) {
    return false;
  }
  return rebuild_one(index, [&](State& state) {
    return build(state, layout, configuration, binding, fonts);
  });
}

}
