#include "nvs_config_storage.hpp"

#include <algorithm>
#include <array>
#include <string_view>

#include "esp_err.h"
#include "nvs.h"
#include "nvs_flash.h"

namespace pitrig::configuration {
namespace {

constexpr char kPartition[] = "pitrig_cfg";
constexpr char kNamespace[] = "pitrig_cfg";

std::array<char, NVS_KEY_NAME_MAX_SIZE> key_for(
    const ConfigurationDocument document) {
  const std::string_view name = configuration_document_name(document);
  std::array<char, NVS_KEY_NAME_MAX_SIZE> key{};
  const std::size_t length =
      std::min(name.size(), key.size() - 1U);
  std::copy_n(name.begin(), length, key.begin());
  return key;
}

}

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
    const ConfigurationDocument document,
    const std::span<std::uint8_t> destination, std::size_t& size) {
  size = 0;
  if (!initialized_) {
    return false;
  }
  nvs_handle_t handle{};
  if (nvs_open_from_partition(kPartition, kNamespace, NVS_READONLY, &handle) !=
      ESP_OK) {
    return false;
  }
  const std::array<char, NVS_KEY_NAME_MAX_SIZE> key = key_for(document);
  std::size_t required{};
  esp_err_t result = nvs_get_blob(handle, key.data(), nullptr, &required);
  if (result == ESP_OK && required > destination.size()) {
    result = ESP_ERR_NVS_INVALID_LENGTH;
  }
  if (result == ESP_OK) {
    size = required;
    result = nvs_get_blob(handle, key.data(), destination.data(), &size);
  }
  nvs_close(handle);
  if (result != ESP_OK) {
    size = 0;
  }
  return result == ESP_OK;
}

bool NvsConfigurationStorage::write(
    const ConfigurationDocument document,
    const std::span<const std::uint8_t> data) {
  if (!initialized_ || data.empty()) {
    return false;
  }
  nvs_handle_t handle{};
  if (nvs_open_from_partition(kPartition, kNamespace, NVS_READWRITE, &handle) !=
      ESP_OK) {
    return false;
  }
  const std::array<char, NVS_KEY_NAME_MAX_SIZE> key = key_for(document);
  const esp_err_t result =
      nvs_set_blob(handle, key.data(), data.data(), data.size());
  const esp_err_t commit = result == ESP_OK ? nvs_commit(handle) : result;
  nvs_close(handle);
  return result == ESP_OK && commit == ESP_OK;
}

bool NvsConfigurationStorage::erase(const ConfigurationDocument document) {
  if (!initialized_) {
    return false;
  }
  nvs_handle_t handle{};
  if (nvs_open_from_partition(kPartition, kNamespace, NVS_READWRITE, &handle) !=
      ESP_OK) {
    return false;
  }
  const std::array<char, NVS_KEY_NAME_MAX_SIZE> key = key_for(document);
  esp_err_t result = nvs_erase_key(handle, key.data());
  if (result == ESP_ERR_NVS_NOT_FOUND) {
    result = ESP_OK;
  }
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

}
