#pragma once

#include <cstdint>

namespace simcore::lap_timer {

// Supplies the latest lap time received from telemetry.
void update(std::uint32_t lap_time_ms);

// Returns the locally extrapolated current lap time.
[[nodiscard]] std::uint32_t current_time();

}  // namespace simcore::lap_timer
