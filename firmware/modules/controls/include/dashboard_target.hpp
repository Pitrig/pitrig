#pragma once

#include <cstdint>

namespace pitrig::controls {

enum class CommandKind : std::uint8_t {
  step_screen,
  show_screen,
  step_page,
  show_page,
  hold_page,
  release_page,
  dismiss_page,
  new_session,
};

struct DashboardCommand {
  CommandKind kind{};
  std::int8_t delta{};
  bool wrap{};
  std::uint8_t screen{};
  std::uint8_t slot{};
  std::uint8_t page{};
};

class DashboardTarget {
 public:
  virtual ~DashboardTarget() = default;

  virtual bool post(const DashboardCommand& command) = 0;
  [[nodiscard]] virtual std::uint8_t active_screen() const = 0;
  virtual void set_backlight(std::uint8_t percent) = 0;
};

}
