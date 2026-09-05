#pragma once

#include "configuration_storage.hpp"

namespace pitrig::configuration {

class NvsConfigurationStorage final : public IConfigurationStorage {
 public:
  bool initialize() override;
  bool read(ConfigurationDocument document,
            std::span<std::uint8_t> destination, std::size_t& size) override;
  bool write(ConfigurationDocument document,
             std::span<const std::uint8_t> data) override;
  bool erase(ConfigurationDocument document) override;
  bool reset() override;

 private:
  bool initialized_{};
};

}
