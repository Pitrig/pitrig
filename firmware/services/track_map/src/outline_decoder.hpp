#pragma once

#include <string_view>

#include "track_map.hpp"

namespace pitrig::track_map {

[[nodiscard]] bool decode_outline(std::string_view body, Outline& outline);

}
