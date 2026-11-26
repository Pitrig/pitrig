#pragma once

#include <cstdint>

#include "application.hpp"
#include "board_registry.hpp"
#include "display_panel.hpp"

namespace pitrig::boot {

ConfigurationBuffers reserve_configuration_memory(Application& application);

[[nodiscard]] configuration::PanelChoice begin_panel(Application& application,
                                                     const board_registry::BoardDefinition& board);

void load_configuration(Application& application, const board_registry::BoardDefinition& board,
                        const ConfigurationBuffers& buffers, std::uint8_t panel);

void open_asset_storage(Application& application);

void start_panel_check(Application& application, const board_registry::BoardDefinition& board,
                       configuration::PanelChoice panel, bool touch);

}
