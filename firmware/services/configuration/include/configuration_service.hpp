#pragma once

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
  static constexpr std::size_t kRecordBufferSize =
      20 + kMaximumPayloadSize;
  static constexpr std::size_t kPayloadBufferSize = kMaximumPayloadSize;
  // Two runtime documents: the active one every consumer reads, and the scratch
  // one a replacement is parsed and validated into. Promotion swaps the two
  // pointers, so the previous document stays intact and no consumer ever reads
  // a half-written structure.
  static constexpr std::size_t kConfigurationBufferSize =
      2 * sizeof(ApplicationConfiguration);

  bool initialize(IConfigurationStorage& storage,
                  const ValidationContext& validation_profile,
                  std::span<const std::uint8_t> factory_payload,
                  std::span<std::uint8_t> record_buffer,
                  std::span<std::uint8_t> current_payload_buffer,
                  std::span<std::uint8_t> configuration_buffer);

  [[nodiscard]] const ApplicationConfiguration& current() const {
    return *active_;
  }
  [[nodiscard]] ConfigurationStatus status() const { return status_; }
  [[nodiscard]] BoardId hardware_board() const {
    return validation_profile_.board;
  }

  [[nodiscard]] std::span<const std::uint8_t> current_payload() const {
    return {current_payload_.data(), current_payload_size_};
  }
  [[nodiscard]] ValidationFailure validate_payload(
      std::span<const std::uint8_t> payload) const;
  // A save fails two ways that mean different things to the host: the document
  // was rejected, or the flash write failed. Reporting the second as a
  // validation error sends the author looking for a fault in JSON that is
  // perfectly good, so the two are kept apart here rather than flattened into
  // one ValidationError.
  struct SaveOutcome {
    ValidationFailure failure{};
    bool storage_failed{};

    [[nodiscard]] bool ok() const {
      return failure.ok() && !storage_failed;
    }
  };
  [[nodiscard]] SaveOutcome save(std::span<const std::uint8_t> payload);
  [[nodiscard]] bool reset();

  // Runtime application without persistence. `stage` parses and validates a
  // replacement into the inactive document, leaving the active one and flash
  // untouched, so a caller can inspect the candidate before committing to it.
  // `promote` then makes it active; `revert` undoes a promotion. Both are a
  // pointer swap, so no consumer can observe a partially written document.
  [[nodiscard]] ValidationFailure stage(
      std::span<const std::uint8_t> payload);
  [[nodiscard]] const ApplicationConfiguration& staged() const {
    return *scratch_;
  }
  void promote();
  void revert();

 private:
  static constexpr std::uint32_t kRecordMagic = 0x53434647;
  static constexpr std::uint16_t kRecordVersion = 1;
  static constexpr std::size_t kRecordHeaderSize = 20;

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

  // Promotes the freshly parsed scratch document to active.
  void promote_scratch();

  IConfigurationStorage* storage_{};
  ValidationContext validation_profile_{};
  ApplicationConfiguration* active_{};
  ApplicationConfiguration* scratch_{};
  ConfigurationStatus status_{};
  StorageSlot persisted_slot_{StorageSlot::a};
  std::uint32_t persisted_generation_{};
  bool has_persisted_slot_{};
  std::span<std::uint8_t> record_buffer_{};
  std::span<std::uint8_t> current_payload_{};
  std::size_t current_payload_size_{};
};

}  // namespace simcore::configuration
