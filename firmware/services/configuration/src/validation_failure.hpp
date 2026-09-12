#pragma once

#include <cstddef>
#include <string_view>

#include "configuration_schema_generated.hpp"

namespace pitrig::configuration {

inline bool reject(ValidationFailure& failure, const ValidationError error,
                   const std::string_view object, const std::string_view key = {}) {
  if (!failure.ok()) {
    return false;
  }
  failure.error = error;
  std::size_t length = 0;
  const auto append = [&failure, &length](const std::string_view text) {
    for (const char character : text) {
      if (length + 1 >= failure.path.size()) {
        return;
      }
      failure.path[length++] = character;
    }
  };
  append(object);
  if (!key.empty()) {
    append(".");
    append(key);
  }
  return false;
}

}
