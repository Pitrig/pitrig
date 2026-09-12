#pragma once

#include "transport.hpp"

namespace pitrig::board_registry {
struct BoardDefinition;
}

namespace pitrig::configuration {
struct ApplicationConfiguration;
}

namespace pitrig::transport {

class TelemetryComposition final {
 public:
  [[nodiscard]] ITransport* select(const board_registry::BoardDefinition& board,
                                   const configuration::ApplicationConfiguration& configuration);

  void silence_logs();
};

}
