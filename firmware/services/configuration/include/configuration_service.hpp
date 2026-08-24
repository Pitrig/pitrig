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

// What became of one stored document at boot. A device that comes up on the
// factory dashboard after a firmware update looks exactly like one that was
// never configured; this is how the composition root tells the two apart and
// says so.
enum class DocumentOutcome : std::uint8_t {
  absent,              // nothing stored, or the storage read failed
  malformed_record,    // wrong magic, record version, or sizes
  unsupported_schema,  // written by a firmware with another schema version
  corrupt_payload,     // payload CRC does not match
  rejected,            // parsed, but validation refused it — see `failure`
  valid,
};

inline constexpr std::array<std::string_view, 6> kDocumentOutcomeNames{{
    "absent",           "malformed_record", "unsupported_schema",
    "corrupt_payload",  "rejected",         "valid",
}};

// What `@SC:INFO` calls one document's stored record. A host that has to tell
// "never configured" from "written by another schema version" reads this rather
// than guessing from a dashboard that came up empty.
[[nodiscard]] inline std::string_view document_outcome_name(
    const DocumentOutcome outcome) {
  const auto index = static_cast<std::size_t>(outcome);
  return index < kDocumentOutcomeNames.size() ? kDocumentOutcomeNames[index]
                                              : std::string_view{};
}

struct DocumentStatus {
  DocumentOutcome outcome{DocumentOutcome::absent};
  ValidationFailure failure{};  // meaningful for `rejected` only
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

// Every document's payload buffer at once. Only the dashboard needs the full
// bound, so holding all three costs a little over one of the old single
// buffers rather than three of them.
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
  // One record at a time is read or built, so the widest document sizes this.
  static constexpr std::size_t kRecordBufferSize =
      kRecordHeaderSize + kMaximumPayloadSize;
  static constexpr std::size_t kPayloadBufferSize =
      total_document_payload_size();
  // Two runtime documents: the active one every consumer reads, and the scratch
  // one a replacement is parsed and validated into. Promotion swaps the two
  // pointers, so the previous document stays intact and no consumer ever reads
  // a half-written structure.
  static constexpr std::size_t kConfigurationBufferSize =
      2 * sizeof(ApplicationConfiguration);

  using FactoryPayloads =
      std::array<std::span<const std::uint8_t>, kConfigurationDocumentCount>;

  // Which stored records may replace their factory values. A document left out
  // is still read, validated and reported, so `INFO` and `GET` answer with what
  // is stored — it simply is not what the device runs. A recovery boot leaves
  // out `protocol`: a stored transport the host cannot reach would otherwise
  // make the recovery as unreachable as the boot it is recovering from.
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

  // The exact bytes this document would be loaded from, which is what `GET`
  // echoes: the stored record's payload, or the factory one while no record is
  // held. `SET` and `RESET` move it because they change what the next boot
  // reads; `APPLY` deliberately does not, because a host asking what the board
  // holds must not be answered with a preview that flash never took.
  [[nodiscard]] std::span<const std::uint8_t> current_payload(
      ConfigurationDocument document) const;
  [[nodiscard]] ValidationFailure validate_payload(
      ConfigurationDocument document,
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
  [[nodiscard]] SaveOutcome save(ConfigurationDocument document,
                                 std::span<const std::uint8_t> payload);
  [[nodiscard]] bool erase(ConfigurationDocument document);
  [[nodiscard]] bool reset();

  // Runtime application without persistence. `stage` parses and validates a
  // replacement into the inactive document, leaving the active one and flash
  // untouched, so a caller can inspect the candidate before committing to it.
  // `promote` then makes it active; `revert` undoes a promotion. Both are a
  // pointer swap, so no consumer can observe a partially written document.
  //
  // The scratch document starts as a copy of the active one, because a document
  // replaces only the sections it owns: the dashboard has to still be there
  // when the protocol document is validated against it.
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
  // Copies the bytes a document was loaded from into its own slice of the
  // payload buffer, so `GET` can echo them without a serializer.
  void remember_payload(ConfigurationDocument document,
                        std::span<const std::uint8_t> payload);

  // Promotes the freshly parsed scratch document to active.
  void promote_scratch();
  // Seeds the scratch document from the active one, which is what makes a
  // per-document replacement leave the rest of the configuration alone.
  void copy_active_to_scratch() const;

  IConfigurationStorage* storage_{};
  // Kept so an erase can put `GET` back on the document the next boot would
  // read. The spans address compiled literals, which outlive the service.
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

}  // namespace simcore::configuration
