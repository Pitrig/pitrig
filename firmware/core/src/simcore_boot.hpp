#pragma once

#include "application.hpp"
#include "board_registry.hpp"

namespace simcore::boot {

ConfigurationBuffers reserve_configuration_memory(Application& application);

void load_configuration(Application& application,
                        const board_registry::BoardDefinition& board,
                        const ConfigurationBuffers& buffers);

void open_asset_storage(Application& application);

}
