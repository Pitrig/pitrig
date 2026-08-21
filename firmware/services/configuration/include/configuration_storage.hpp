#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"

namespace simcore::configuration {

// One record per document, and no more. NVS replaces a blob by writing the new
// one before retiring the old, so a torn write leaves the previous record
// readable; the pair of alternating slots this used to keep bought a second
// copy of that guarantee and nothing else.
class IConfigurationStorage {
 public:
  virtual ~IConfigurationStorage() = default;

  virtual bool initialize() = 0;
  virtual bool read(ConfigurationDocument document,
                    std::span<std::uint8_t> destination,
                    std::size_t& size) = 0;
  virtual bool write(ConfigurationDocument document,
                     std::span<const std::uint8_t> data) = 0;
  virtual bool erase(ConfigurationDocument document) = 0;
  virtual bool reset() = 0;
};

}  // namespace simcore::configuration
