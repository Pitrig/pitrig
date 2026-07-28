#include "race_dashboard_widget.hpp"

#include <array>
#include <cstdint>
#include <cstdio>
#include <utility>

#include "dashboard_fonts.hpp"
#include "dashboard_layout_internal.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "telemetry_state.hpp"

namespace simcore::dashboard::race_dashboard_widget {
namespace {

constexpr std::uint32_t kUpdatePeriodMs = 50;
constexpr std::uint32_t kWhite = 0xF4F4F4;
constexpr std::uint32_t kMuted = 0x8A8A8A;
constexpr std::uint32_t kPanel = 0x050505;
constexpr std::uint32_t kBorder = 0xD0D0D0;

enum LabelIndex : std::size_t {
  gear,
  rpm,
  speed,
  delta,
  estimated,
  last,
  best,
  session,
  position,
  laps,
  tc,
  tc_cut,
  abs,
  brake_bias,
  engine_map,
  fuel,
  fuel_average,
  fuel_laps,
  air,
  track,
  tire_fl,
  tire_fr,
  tire_rl,
  tire_rr,
  count
};

struct State {
  const telemetry::ITelemetryReader* telemetry{};
  std::array<lv_obj_t*, LabelIndex::count> labels{};
  std::uint64_t revision{static_cast<std::uint64_t>(-1)};
};

State state;

lv_obj_t* panel(lv_obj_t* parent, int x, int y, int width, int height, int radius = 10) {
  lv_obj_t* object = lv_obj_create(parent);
  lv_obj_remove_style_all(object);
  lv_obj_set_pos(object, x, y);
  lv_obj_set_size(object, width, height);
  lv_obj_set_style_bg_color(object, lv_color_hex(kPanel), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(object, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_color(object, lv_color_hex(kBorder), LV_PART_MAIN);
  lv_obj_set_style_border_width(object, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(object, radius, LV_PART_MAIN);
  lv_obj_remove_flag(object, LV_OBJ_FLAG_SCROLLABLE);
  return object;
}

lv_obj_t* label(lv_obj_t* parent, const char* text, int x, int y, int width, const FontSpec font,
                std::uint32_t color = kWhite, lv_text_align_t align = LV_TEXT_ALIGN_CENTER) {
  lv_obj_t* object = lv_label_create(parent);
  lv_obj_remove_style_all(object);
  lv_obj_set_pos(object, x, y);
  lv_obj_set_width(object, width);
  lv_obj_set_style_text_align(object, align, LV_PART_MAIN);
  lv_obj_set_style_text_font(object, fonts::resolve(font), LV_PART_MAIN);
  lv_obj_set_style_text_color(object, lv_color_hex(color), LV_PART_MAIN);
  lv_label_set_text(object, text);
  return object;
}

void time_text(char* output, std::size_t size, std::uint32_t milliseconds) {
  const auto seconds = milliseconds / 1000U;
  std::snprintf(output, size, "%02lu:%02lu.%03lu", static_cast<unsigned long>(seconds / 60U % 100U),
                static_cast<unsigned long>(seconds % 60U),
                static_cast<unsigned long>(milliseconds % 1000U));
}

void set_time(lv_obj_t* object, const telemetry::TelemetrySnapshot& snapshot,
              telemetry::Field field, std::uint32_t value) {
  char text[16] = "--:--.---";
  if (telemetry::contains(snapshot.valid_fields, field)) {
    time_text(text, sizeof(text), value);
  }
  lv_label_set_text(object, text);
}

void create_tire_cell(lv_obj_t* parent, LabelIndex index, const char* name, int x, int y,
                      int width) {
  label(parent, name, x, y, width, {.family = FontFamily::montserrat, .size_px = 10}, kMuted);
  state.labels[index] = label(parent, "--.--  --.-  --.-", x, y + 15, width,
                              {.family = FontFamily::montserrat, .size_px = 10});
}

void create_page(lv_obj_t* root, int width, int height,
                 const LayoutVariant variant) {
  const int gap = 6;
  const bool wide = variant == LayoutVariant::wide;
  const int top_h = height * (wide ? 76 : 58) / 100;
  const int left_w = width * (wide ? 43 : 38) / 100;
  const int center_w = width * (wide ? 14 : 25) / 100;
  lv_obj_t* tires = panel(root, 0, 0, left_w - gap, top_h);
  label(tires, "TIRES", 0, 4, left_w - gap, {.family = FontFamily::montserrat, .size_px = 10},
        kWhite);
  const int cell_w = (left_w - gap - 10) / 2;
  create_tire_cell(tires, tire_fl, "FL", 5, 30, cell_w);
  create_tire_cell(tires, tire_fr, "FR", 5 + cell_w, 30, cell_w);
  create_tire_cell(tires, tire_rl, "RL", 5, top_h / 2 + 10, cell_w);
  create_tire_cell(tires, tire_rr, "RR", 5 + cell_w, top_h / 2 + 10, cell_w);

  lv_obj_t* drive = panel(root, left_w, 0, center_w - gap, top_h, 6);
  state.labels[delta] = label(drive, "+0.000", 0, 4, center_w - gap,
                              {.family = FontFamily::montserrat, .size_px = 24}, 0xFFD740);
  state.labels[gear] =
      label(drive, "N", 0, 42, center_w - gap, {.family = FontFamily::montserrat, .size_px = 48});
  state.labels[rpm] =
      label(drive, "0", 0, 105, center_w - gap, {.family = FontFamily::montserrat, .size_px = 24});
  state.labels[speed] = label(drive, "0", 0, top_h - 62, center_w - gap,
                              {.family = FontFamily::montserrat, .size_px = 48});
  state.labels[air] = label(drive, "AIR --.-", 2, top_h - 20, (center_w - gap) / 2,
                            {.family = FontFamily::montserrat, .size_px = 10});
  state.labels[track] =
      label(drive, "TRACK --.-", (center_w - gap) / 2, top_h - 20, (center_w - gap) / 2,
            {.family = FontFamily::montserrat, .size_px = 10});

  const int right_x = left_w + center_w;
  const int right_w = width - right_x;
  lv_obj_t* session_panel = panel(root, right_x, 0, right_w, height * 17 / 100);
  state.labels[session] = label(session_panel, "00:00", 4, 9, right_w / 3,
                                {.family = FontFamily::montserrat, .size_px = 24});
  state.labels[position] = label(session_panel, "-/-- POS", right_w / 3, 9, right_w / 3,
                                 {.family = FontFamily::montserrat, .size_px = 10});
  state.labels[laps] = label(session_panel, "-/-- LAPS", right_w * 2 / 3, 9, right_w / 3,
                             {.family = FontFamily::montserrat, .size_px = 10});

  lv_obj_t* times =
      panel(root, right_x, height * 17 / 100 + gap, right_w, top_h - height * 17 / 100 - gap);
  label(times, "LAP TIMES", 0, 4, right_w, {.family = FontFamily::montserrat, .size_px = 10});
  state.labels[estimated] = label(times, "--:--.---", 0, 25, right_w,
                                  {.family = FontFamily::montserrat, .size_px = 24}, 0xFFD740);
  state.labels[last] = label(times, "--:--.---", 0, 70, right_w,
                             {.family = FontFamily::montserrat, .size_px = 24}, 0xE000D8);
  state.labels[best] = label(times, "--:--.---", 0, 115, right_w,
                             {.family = FontFamily::montserrat, .size_px = 24}, 0x00F040);

  const int aids_y = top_h + gap;
  const int aids_h = height - aids_y;
  const int card_w = width / 8;
  const std::array<const char*, 5> titles{"TC", "TC CUT", "ABS", "BB", "MAP"};
  const std::array<LabelIndex, 5> indexes{tc, tc_cut, abs, brake_bias, engine_map};
  const std::array<std::uint32_t, 5> colors{0x00CFFF, 0x00CFFF, 0xFFD740, 0xF00020, 0x00C030};
  for (std::size_t i = 0; i < indexes.size(); ++i) {
    lv_obj_t* card = panel(root, static_cast<int>(i) * card_w, aids_y, card_w - 4, aids_h, 8);
    label(card, titles[i], 0, 4, card_w - 4, {.family = FontFamily::montserrat, .size_px = 10},
          colors[i]);
    state.labels[indexes[i]] = label(card, "-", 0, 30, card_w - 4,
                                     {.family = FontFamily::montserrat, .size_px = 24}, colors[i]);
  }
  const int fuel_x = card_w * 5;
  lv_obj_t* fuel_panel = panel(root, fuel_x, aids_y, width - fuel_x, aids_h, 8);
  label(fuel_panel, "FUEL", 0, 4, width - fuel_x,
        {.family = FontFamily::montserrat, .size_px = 10});
  const int stat_w = (width - fuel_x) / 3;
  state.labels[fuel] =
      label(fuel_panel, "--", 0, 30, stat_w, {.family = FontFamily::montserrat, .size_px = 24});
  state.labels[fuel_average] = label(fuel_panel, "--.-", stat_w, 30, stat_w,
                                     {.family = FontFamily::montserrat, .size_px = 24});
  state.labels[fuel_laps] = label(fuel_panel, "--.-", stat_w * 2, 30, stat_w,
                                  {.family = FontFamily::montserrat, .size_px = 24});
}

void render() {
  const telemetry::TelemetrySnapshot snapshot = state.telemetry->snapshot();
  if (snapshot.revision == state.revision) return;
  state.revision = snapshot.revision;
  char text[32];
#define SET_NUM(index, field, format, value)               \
  do {                                                     \
    if (telemetry::contains(snapshot.valid_fields, field)) \
      std::snprintf(text, sizeof(text), format, value);    \
    else                                                   \
      std::snprintf(text, sizeof(text), "-");              \
    lv_label_set_text(state.labels[index], text);          \
  } while (false)
  if (telemetry::contains(snapshot.valid_fields, telemetry::Field::gear)) {
    if (snapshot.values.gear == 0)
      std::snprintf(text, sizeof(text), "N");
    else if (snapshot.values.gear < 0)
      std::snprintf(text, sizeof(text), "R");
    else
      std::snprintf(text, sizeof(text), "%d", snapshot.values.gear);
  } else
    std::snprintf(text, sizeof(text), "-");
  lv_label_set_text(state.labels[gear], text);
  SET_NUM(rpm, telemetry::Field::rpm, "%lu", static_cast<unsigned long>(snapshot.values.rpm));
  SET_NUM(speed, telemetry::Field::speed, "%.0f", static_cast<double>(snapshot.values.speed_kph));
  SET_NUM(delta, telemetry::Field::lap_delta, "%+.3f",
          static_cast<double>(snapshot.values.lap_delta_ms) / 1000.0);
  set_time(state.labels[estimated], snapshot, telemetry::Field::lap_time_estimated,
           snapshot.values.lap_time_estimated_ms);
  set_time(state.labels[last], snapshot, telemetry::Field::lap_time_last,
           snapshot.values.lap_time_last_ms);
  set_time(state.labels[best], snapshot, telemetry::Field::lap_time_best,
           snapshot.values.lap_time_best_ms);
  SET_NUM(tc, telemetry::Field::traction_control, "%u",
          static_cast<unsigned>(snapshot.values.traction_control_level));
  SET_NUM(tc_cut, telemetry::Field::traction_control_cut, "%u",
          static_cast<unsigned>(snapshot.values.traction_control_cut_level));
  SET_NUM(abs, telemetry::Field::abs, "%u",
          static_cast<unsigned>(snapshot.values.abs_level));
  SET_NUM(brake_bias, telemetry::Field::brake_bias, "%.1f",
          snapshot.values.brake_bias_tenths_percent / 10.0);
  SET_NUM(engine_map, telemetry::Field::engine_map, "%u",
          static_cast<unsigned>(snapshot.values.engine_map));
  SET_NUM(fuel, telemetry::Field::fuel, "%.0f", static_cast<double>(snapshot.values.fuel_liters));
  SET_NUM(fuel_average, telemetry::Field::fuel_average_consumption, "%.1f",
          static_cast<double>(snapshot.values.fuel_average_liters_per_lap));
  SET_NUM(fuel_laps, telemetry::Field::fuel_laps_remaining, "%.1f",
          static_cast<double>(snapshot.values.fuel_laps_remaining));
  if (telemetry::contains(snapshot.valid_fields, telemetry::Field::session_time))
    std::snprintf(text, sizeof(text), "%02lu:%02lu",
                  static_cast<unsigned long>(snapshot.values.session_time_seconds / 60),
                  static_cast<unsigned long>(snapshot.values.session_time_seconds % 60));
  else
    std::snprintf(text, sizeof(text), "--:--");
  lv_label_set_text(state.labels[session], text);
  if (telemetry::contains(snapshot.valid_fields, telemetry::Field::session_position))
    std::snprintf(text, sizeof(text), "%u/%u POS",
                  static_cast<unsigned>(snapshot.values.session_position),
                  static_cast<unsigned>(
                      snapshot.values.session_participant_count));
  else
    std::snprintf(text, sizeof(text), "-/-- POS");
  lv_label_set_text(state.labels[position], text);
  if (telemetry::contains(snapshot.valid_fields, telemetry::Field::session_laps))
    std::snprintf(text, sizeof(text), "%u/%u LAPS",
                  static_cast<unsigned>(
                      snapshot.values.session_completed_laps),
                  static_cast<unsigned>(snapshot.values.session_total_laps));
  else
    std::snprintf(text, sizeof(text), "-/-- LAPS");
  lv_label_set_text(state.labels[laps], text);
  SET_NUM(air, telemetry::Field::air_temperature, "AIR %.1f",
          snapshot.values.air_temperature_tenths_c / 10.0);
  SET_NUM(track, telemetry::Field::track_temperature, "TRACK %.1f",
          snapshot.values.track_temperature_tenths_c / 10.0);
  const std::array<std::pair<LabelIndex, telemetry::Field>, 4> tire_fields{
      {{tire_fl, telemetry::Field::tire_front_left},
       {tire_fr, telemetry::Field::tire_front_right},
       {tire_rl, telemetry::Field::tire_rear_left},
       {tire_rr, telemetry::Field::tire_rear_right}}};
  const std::array<telemetry::Values::Tire, 4> tires{
      {snapshot.values.tire_front_left, snapshot.values.tire_front_right,
       snapshot.values.tire_rear_left, snapshot.values.tire_rear_right}};
  for (std::size_t i = 0; i < tires.size(); ++i) {
    if (telemetry::contains(snapshot.valid_fields, tire_fields[i].second))
      std::snprintf(text, sizeof(text), "%.2f  %.1f  %.1f",
                    static_cast<double>(tires[i].pressure_bar),
                    static_cast<double>(tires[i].surface_temperature_c),
                    static_cast<double>(tires[i].inner_temperature_c));
    else
      std::snprintf(text, sizeof(text), "--.--  --.-  --.-");
    lv_label_set_text(state.labels[tire_fields[i].first], text);
  }
#undef SET_NUM
}

void update(lv_timer_t*) { render(); }

}  // namespace

bool create(const Layout& layout, const Config& config,
            const telemetry::ITelemetryReader& telemetry) {
  if (layout.display == nullptr || !lvgl_port_lock(0)) return false;
  lv_obj_t* parent{};
  Rect bounds{};
  if (!resolve_widget_bounds(layout, config.placement, 320, 170, true, parent, bounds)) {
    lvgl_port_unlock();
    return false;
  }
  lv_obj_t* root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_set_pos(root, bounds.x, bounds.y);
  lv_obj_set_size(root, bounds.width, bounds.height);
  lv_obj_set_style_bg_color(root, lv_color_hex(0x000000), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(root, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_remove_flag(root, LV_OBJ_FLAG_SCROLLABLE);
  state = {.telemetry = &telemetry};
  create_page(root, bounds.width, bounds.height, config.variant);
  render();
  lv_timer_create(update, kUpdatePeriodMs, nullptr);
  lvgl_port_unlock();
  return true;
}

}  // namespace simcore::dashboard::race_dashboard_widget
