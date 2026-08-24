#pragma once

#include "application.hpp"
#include "board_registry.hpp"

// The boot half of the composition root: carving the configuration buffers out
// of external memory, loading every stored document over its factory value,
// and opening the asset packages. Called once from run() in simcore.cpp.
namespace simcore::boot {

ConfigurationBuffers reserve_configuration_memory(Application& application);

void load_configuration(Application& application,
                        const board_registry::BoardDefinition& board,
                        const ConfigurationBuffers& buffers);

// Opens the font and image packages. Separate from the configuration because
// nothing reads them until there is a dashboard, and the serial link has to be
// up before that: a board that cannot compose one still has to answer.
void open_asset_storage(Application& application);

}  // namespace simcore::boot
