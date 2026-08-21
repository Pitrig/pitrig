#pragma once

#include "application.hpp"
#include "board_registry.hpp"

// The boot half of the composition root: carving the configuration buffers out
// of external memory and loading every stored document over its factory value.
// Called once from run() in simcore.cpp, before anything draws or answers.
namespace simcore::boot {

ConfigurationBuffers reserve_configuration_memory(Application& application);

void load_configuration(Application& application,
                        const board_registry::BoardDefinition& board,
                        const ConfigurationBuffers& buffers);

}  // namespace simcore::boot
