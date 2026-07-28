#include "nvs_config_storage.hpp"

#include "esp_err.h"
#include "nvs.h"
#include "nvs_flash.h"

namespace simcore::configuration {
namespace {

constexpr char kPartition[] = "simcore_cfg";
constexpr char kNamespace[] = "simcore_cfg";
constexpr char kSlotAKey[] = "slot_a";
constexpr char kSlotBKey[] = "slot_b";
constexpr char kActiveKey[] = "active";

const char* key_for(const StorageSlot slot) {
  return slot == StorageSlot::a ? kSlotAKey : kSlotBKey;
}

}  // namespace

bool NvsConfigurationStorage::initialize() {
  esp_err_t result = nvs_flash_init_partition(kPartition);
  if (result == ESP_ERR_NVS_NO_FREE_PAGES ||
      result == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    if (nvs_flash_erase_partition(kPartition) != ESP_OK) {
      return false;
    }
    result = nvs_flash_init_partition(kPartition);
  }
  initialized_ = result == ESP_OK;
  return initialized_;
}

bool NvsConfigurationStorage::read(
    const StorageSlot slot, const std::span<std::uint8_t> destination,
    std::size_t& size) {
  size = 0;
  if (!initialized_) {
    return false;
  }
  nvs_handle_t handle{};
  if (nvs_open_from_partition(kPartition, kNamespace, NVS_READONLY, &handle) !=
      ESP_OK) {
    return false;
  }
  std::size_t required{};
  esp_err_t result = nvs_get_blob(handle, key_for(slot), nullptr, &required);
  if (result == ESP_OK && required <= destination.size()) {
    size = required;
    result =
        nvs_get_blob(handle, key_for(slot), destination.data(), &size);
  }
  nvs_close(handle);
  return result == ESP_OK;
}

bool NvsConfigurationStorage::write(
    const StorageSlot slot, const std::span<const std::uint8_t> data) {
  if (!initialized_ || data.empty()) {
    return false;
  }
  nvs_handle_t handle{};
  if (nvs_open_from_partition(kPartition, kNamespace, NVS_READWRITE, &handle) !=
      ESP_OK) {
    return false;
  }
  const esp_err_t result = nvs_set_blob(handle, key_for(slot), data.data(),
                                        data.size());
  const esp_err_t commit = result == ESP_OK ? nvs_commit(handle) : result;
  nvs_close(handle);
  return result == ESP_OK && commit == ESP_OK;
}

bool NvsConfigurationStorage::read_active(StorageSlot& slot) {
  if (!initialized_) {
    return false;
  }
  nvs_handle_t handle{};
  if (nvs_open_from_partition(kPartition, kNamespace, NVS_READONLY, &handle) !=
      ESP_OK) {
    return false;
  }
  std::uint8_t value{};
  const esp_err_t result = nvs_get_u8(handle, kActiveKey, &value);
  nvs_close(handle);
  if (result != ESP_OK || value > 1U) {
    return false;
  }
  slot = value == 0 ? StorageSlot::a : StorageSlot::b;
  return true;
}

bool NvsConfigurationStorage::set_active(const StorageSlot slot) {
  if (!initialized_) {
    return false;
  }
  nvs_handle_t handle{};
  if (nvs_open_from_partition(kPartition, kNamespace, NVS_READWRITE, &handle) !=
      ESP_OK) {
    return false;
  }
  const esp_err_t result =
      nvs_set_u8(handle, kActiveKey, slot == StorageSlot::a ? 0U : 1U);
  const esp_err_t commit = result == ESP_OK ? nvs_commit(handle) : result;
  nvs_close(handle);
  return result == ESP_OK && commit == ESP_OK;
}

bool NvsConfigurationStorage::reset() {
  if (!initialized_) {
    return false;
  }
  nvs_handle_t handle{};
  if (nvs_open_from_partition(kPartition, kNamespace, NVS_READWRITE, &handle) !=
      ESP_OK) {
    return false;
  }
  const esp_err_t result = nvs_erase_all(handle);
  const esp_err_t commit = result == ESP_OK ? nvs_commit(handle) : result;
  nvs_close(handle);
  return result == ESP_OK && commit == ESP_OK;
}

}  // namespace simcore::configuration
