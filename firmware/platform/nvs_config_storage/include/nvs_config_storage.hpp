#pragma once

#include "configuration_storage.hpp"

namespace simcore::configuration {

class NvsConfigurationStorage final : public IConfigurationStorage {
 public:
  bool initialize() override;
  bool read(StorageSlot slot, std::span<std::uint8_t> destination,
            std::size_t& size) override;
  bool write(StorageSlot slot,
             std::span<const std::uint8_t> data) override;
  bool read_active(StorageSlot& slot) override;
  bool set_active(StorageSlot slot) override;
  bool reset() override;

 private:
  bool initialized_{};
};

}  // namespace simcore::configuration
