#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "configuration_codec.hpp"
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
                  const ApplicationConfiguration& factory_configuration);

  [[nodiscard]] const ApplicationConfiguration& current() const {
    return current_;
  }
  [[nodiscard]] ConfigurationStatus status() const { return status_; }

  [[nodiscard]] CodecResult encode_current(
      std::span<std::uint8_t> output) const;
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
    ApplicationConfiguration configuration{};
    std::uint32_t generation{};
    bool valid{};
  };

  [[nodiscard]] LoadedRecord load_slot(StorageSlot slot);
  [[nodiscard]] bool build_record(std::span<const std::uint8_t> payload,
                                  std::uint32_t generation,
                                  std::span<std::uint8_t> output,
                                  std::size_t& size) const;

  IConfigurationStorage* storage_{};
  BoardId hardware_board_{BoardId::t_display_s3};
  ApplicationConfiguration current_{};
  ConfigurationStatus status_{};
  std::array<std::uint8_t, kMaximumRecordSize> record_buffer_{};
};

}  // namespace simcore::configuration
