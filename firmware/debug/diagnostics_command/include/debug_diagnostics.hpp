#pragma once

#include <cstddef>

namespace pitrig::debug::diagnostics {

[[nodiscard]] int write(char* out, std::size_t size);

}
