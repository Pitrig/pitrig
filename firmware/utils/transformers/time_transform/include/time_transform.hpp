#pragma once

#include <cstdint>
#include <span>

namespace simcore::transformers::time_transform {

enum class Format : std::uint8_t {
  duration_ms,
  signed_duration_ms,
};

struct Config {
  Format format{Format::duration_ms};
};

// Renders the configured duration format. Prefix and suffix belong to the
// transform configuration that selects this format, not to time itself.
[[nodiscard]] bool apply(const Config& config, std::uint32_t value,
                         std::span<char> output);
[[nodiscard]] bool apply(const Config& config, std::int32_t value,
                         std::span<char> output);

}  // namespace simcore::transformers::time_transform
