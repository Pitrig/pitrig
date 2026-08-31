#pragma once

#include <cstddef>

namespace simcore::debug::diagnostics {

[[nodiscard]] int write(char* out, std::size_t size);

}
