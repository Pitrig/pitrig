#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

#include "application_configuration.hpp"
#include "configuration_json.hpp"
#include "configuration_storage.hpp"

namespace simcore::configuration {

enum class DocumentOutcome : std::uint8_t {
  absent,
  malformed_record,
  unsupported_schema,
  corrupt_payload,
  rejected,
  valid,
};

inline constexpr std::array<std::string_view, 6> kDocumentOutcomeNames{{
    "absent",           "malformed_record", "unsupported_schema",
    "corrupt_payload",  "rejected",         "valid",
}};

[[nodiscard]] inline std::string_view document_outcome_name(
    const DocumentOutcome outcome) {
  const auto index = static_cast<std::size_t>(outcome);
  return index < kDocumentOutcomeNames.size() ? kDocumentOutcomeNames[index]
                                              : std::string_view{};
}

struct DocumentStatus {
  DocumentOutcome outcome{DocumentOutcome::absent};
  ValidationFailure failure{};
  std::uint32_t generation{};
};

struct ConfigurationStatus {
  bool storage_available{};
  std::array<DocumentStatus, kConfigurationDocumentCount> documents{};

  [[nodiscard]] const DocumentStatus& of(
      const ConfigurationDocument document) const {
    return documents[static_cast<std::size_t>(document)];
  }
};

[[nodiscard]] constexpr std::size_t total_document_payload_size() {
  std::size_t total = 0;
  for (const std::size_t size : kConfigurationDocumentPayloadSizes) {
    total += size;
  }
  return total;
}

class ConfigurationService {
 public:
  static constexpr std::size_t kRecordHeaderSize = 20;
  static constexpr std::size_t kRecordBufferSize =
      kRecordHeaderSize + kMaximumPayloadSize;
  static constexpr std::size_t kPayloadBufferSize =
      total_document_payload_size();
  static constexpr std::size_t kConfigurationBufferSize =
      2 * sizeof(ApplicationConfiguration);

  using FactoryPayloads =
      std::array<std::span<const std::uint8_t>, kConfigurationDocumentCount>;

  using StoredDocuments = std::array<bool, kConfigurationDocumentCount>;
  [[nodiscard]] static constexpr StoredDocuments all_stored_documents() {
    StoredDocuments documents{};
    documents.fill(true);
    return documents;
  }

  bool initialize(IConfigurationStorage& storage,
                  const ValidationContext& validation_profile,
                  const FactoryPayloads& factory_payloads,
                  std::span<std::uint8_t> record_buffer,
                  std::span<std::uint8_t> payload_buffer,
                  std::span<std::uint8_t> configuration_buffer,
                  const StoredDocuments& apply_stored);

  [[nodiscard]] const ApplicationConfiguration& current() const {
    return *active_;
  }
  [[nodiscard]] ConfigurationStatus status() const { return status_; }
  [[nodiscard]] BoardId hardware_board() const {
    return validation_profile_.board;
  }

  [[nodiscard]] std::span<const std::uint8_t> current_payload(
      ConfigurationDocument document) const;
  [[nodiscard]] ValidationFailure validate_payload(
      ConfigurationDocument document,
      std::span<const std::uint8_t> payload) const;
  struct SaveOutcome {
    ValidationFailure failure{};
    bool storage_failed{};

    [[nodiscard]] bool ok() const {
      return failure.ok() && !storage_failed;
    }
  };
  [[nodiscard]] SaveOutcome save(ConfigurationDocument document,
                                 std::span<const std::uint8_t> payload);
  [[nodiscard]] bool erase(ConfigurationDocument document);
  [[nodiscard]] bool reset();

  [[nodiscard]] ValidationFailure stage(
      ConfigurationDocument document, std::span<const std::uint8_t> payload);
  [[nodiscard]] const ApplicationConfiguration& staged() const {
    return *scratch_;
  }
  void promote();
  void revert();

 private:
  static constexpr std::uint32_t kRecordMagic = 0x53434647;
  static constexpr std::uint16_t kRecordVersion = 1;

  struct LoadedRecord {
    std::uint32_t generation{};
    std::size_t payload_size{};
    bool valid{};
    DocumentStatus status{};
  };

  [[nodiscard]] static std::size_t index_of(
      const ConfigurationDocument document) {
    return static_cast<std::size_t>(document);
  }

  [[nodiscard]] LoadedRecord load_document(
      ConfigurationDocument document, ApplicationConfiguration& configuration);
  [[nodiscard]] bool build_record(std::span<const std::uint8_t> payload,
                                  std::uint32_t generation,
                                  std::span<std::uint8_t> output,
                                  std::size_t& size) const;
  void remember_payload(ConfigurationDocument document,
                        std::span<const std::uint8_t> payload);

  void promote_scratch();
  void copy_active_to_scratch() const;

  IConfigurationStorage* storage_{};
  FactoryPayloads factory_payloads_{};
  ValidationContext validation_profile_{};
  ApplicationConfiguration* active_{};
  ApplicationConfiguration* scratch_{};
  ConfigurationStatus status_{};
  std::span<std::uint8_t> record_buffer_{};
  std::array<std::span<std::uint8_t>, kConfigurationDocumentCount>
      payloads_{};
  std::array<std::size_t, kConfigurationDocumentCount> payload_sizes_{};
};

}
