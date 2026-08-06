#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "configuration_json.hpp"
#include "configuration_storage.hpp"

namespace simcore::configuration {

enum class ConfigurationSource : std::uint8_t {
  factory,
  slot_a,
  slot_b,
};

struct ConfigurationStatus {
  ConfigurationSource source{ConfigurationSource::factory};
  std::uint32_t generation{};
  bool storage_available{};
};

class ConfigurationService {
 public:
  bool initialize(IConfigurationStorage& storage,
                  const ValidationContext& validation_profile,
                  std::span<const std::uint8_t> factory_payload);

  [[nodiscard]] const ApplicationConfiguration& current() const {
    return current_;
  }
  [[nodiscard]] ConfigurationStatus status() const { return status_; }
  [[nodiscard]] BoardId hardware_board() const {
    return validation_profile_.board;
  }

  [[nodiscard]] std::span<const std::uint8_t> current_payload() const {
    return {current_payload_.data(), current_payload_size_};
  }
  [[nodiscard]] ValidationError validate_payload(
      std::span<const std::uint8_t> payload) const;
  [[nodiscard]] ValidationError save(
      std::span<const std::uint8_t> payload);
  [[nodiscard]] bool reset();

 private:
  static constexpr std::uint32_t kRecordMagic = 0x53434647;
  static constexpr std::uint16_t kRecordVersion = 1;
  static constexpr std::size_t kRecordHeaderSize = 20;
  static constexpr std::size_t kMaximumRecordSize =
      kRecordHeaderSize + kMaximumPayloadSize;

  struct LoadedRecord {
    std::uint32_t generation{};
    bool valid{};
  };

  [[nodiscard]] LoadedRecord load_slot(
      StorageSlot slot, ApplicationConfiguration& configuration);
  [[nodiscard]] bool build_record(std::span<const std::uint8_t> payload,
                                  std::uint32_t generation,
                                  std::span<std::uint8_t> output,
                                  std::size_t& size) const;

  IConfigurationStorage* storage_{};
  ValidationContext validation_profile_{};
  ApplicationConfiguration current_{};
  mutable ApplicationConfiguration scratch_configuration_{};
  ConfigurationStatus status_{};
  StorageSlot persisted_slot_{StorageSlot::a};
  std::uint32_t persisted_generation_{};
  bool has_persisted_slot_{};
  std::array<std::uint8_t, kMaximumRecordSize> record_buffer_{};
  std::array<std::uint8_t, kMaximumPayloadSize> current_payload_{};
  std::size_t current_payload_size_{};
};

}  // namespace simcore::configuration
