#pragma once

#include "configuration_storage.hpp"

namespace pitrig::configuration {

class NvsConfigurationStorage final : public IConfigurationStorage {
 public:
  bool initialize() override;
  StorageRead read(ConfigurationDocument document, std::span<std::uint8_t> destination,
                   std::size_t& size) override;
  bool write(ConfigurationDocument document, std::span<const std::uint8_t> data) override;
  bool erase(ConfigurationDocument document) override;
  bool reset() override;
  StorageRead read_settings(std::span<std::uint8_t> destination, std::size_t& size) override;
  bool write_settings(std::span<const std::uint8_t> data) override;

 private:
  StorageRead read_key(const char* key, std::span<std::uint8_t> destination, std::size_t& size);
  bool write_key(const char* key, std::span<const std::uint8_t> data);

  bool initialized_{};
};

}
