#include <array>
#include <cstdio>
#include <optional>
#include <string_view>

#include "configuration_control.hpp"
#include "control_protocol_generated.hpp"

namespace pitrig::configuration {
namespace {

constexpr std::string_view kCheck = "check";

[[nodiscard]] bool parse_panel(const std::span<const std::uint8_t> value,
                               const std::uint8_t panel_count, PanelChoice& choice) {
  const std::string_view text(reinterpret_cast<const char*>(value.data()), value.size());
  if (text == kCheck) {
    choice = {.check = true};
    return true;
  }
  if (text.size() != 1 || text[0] < '0' || text[0] > '9') {
    return false;
  }
  const auto panel = static_cast<std::uint8_t>(text[0] - '0');
  if (panel >= panel_count) {
    return false;
  }
  choice = {.panel = panel};
  return true;
}

}

void ConfigurationControl::handle_panel(const std::span<const std::uint8_t> argument) {
  const std::uint8_t panel_count = service_->panel_count();
  if (panel_count <= 1) {
    (void)send_text(PITRIG_CONTROL_PREFIX "ERR:unsupported\n");
    return;
  }
  PanelChoice choice{};
  const bool writing = !argument.empty();
  if (writing) {
    if (argument.front() != ':' || !parse_panel(argument.subspan(1), panel_count, choice)) {
      (void)send_text(PITRIG_CONTROL_PREFIX "ERR:unknown_panel\n");
      return;
    }
    if (!service_->choose_panel(choice)) {
      (void)send_text(PITRIG_CONTROL_PREFIX "ERR:storage\n");
      return;
    }
  } else {
    const std::optional<PanelChoice> stored = service_->panel();
    if (!stored.has_value()) {
      (void)send_text(PITRIG_CONTROL_PREFIX "ERR:storage\n");
      return;
    }
    choice = *stored;
  }
  std::array<char, 48> line{};
  const char* const trailer = writing ? ":reboot_required=1" : "";
  const int length =
      choice.check
          ? std::snprintf(line.data(), line.size(), PITRIG_CONTROL_PREFIX "OK:PANEL:check%s\n",
                          trailer)
          : std::snprintf(line.data(), line.size(), PITRIG_CONTROL_PREFIX "OK:PANEL:%u%s\n",
                          static_cast<unsigned>(choice.panel), trailer);
  if (length <= 0 || static_cast<std::size_t>(length) >= line.size()) {
    (void)send_text(PITRIG_CONTROL_PREFIX "ERR:storage\n");
    return;
  }
  (void)send_text(line.data());
}

}
