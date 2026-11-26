#pragma once

#include <cstdint>
#include <optional>

#include "configuration_storage.hpp"

namespace pitrig::configuration {

inline constexpr std::uint8_t kPanelCheckTries = 10;

struct PanelChoice {
  std::uint8_t panel{};
  bool check{};
};

[[nodiscard]] PanelChoice begin_panel(IConfigurationStorage& storage, std::uint8_t panel_count,
                                      bool continues_check);

namespace display_panel {

[[nodiscard]] std::optional<PanelChoice> stored(IConfigurationStorage& storage,
                                                std::uint8_t panel_count);
[[nodiscard]] bool store(IConfigurationStorage& storage, PanelChoice choice,
                         std::uint8_t panel_count);
[[nodiscard]] bool confirm(IConfigurationStorage& storage, std::uint8_t panel,
                           std::uint8_t panel_count);
[[nodiscard]] bool try_next(IConfigurationStorage& storage, std::uint8_t panel_count);

}

}
