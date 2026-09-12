#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"

namespace pitrig::configuration {

enum class StorageRead : std::uint8_t {
  loaded,
  absent,
  failed,
};

class IConfigurationStorage {
 public:
  virtual ~IConfigurationStorage() = default;

  virtual bool initialize() = 0;
  virtual StorageRead read(ConfigurationDocument document, std::span<std::uint8_t> destination,
                           std::size_t& size) = 0;
  virtual bool write(ConfigurationDocument document, std::span<const std::uint8_t> data) = 0;
  virtual bool erase(ConfigurationDocument document) = 0;
  virtual bool reset() = 0;
};

}
