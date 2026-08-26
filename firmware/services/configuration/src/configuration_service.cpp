#include "configuration_service.hpp"

#include <algorithm>
#include <new>
#include <utility>

#include "binary_codec.hpp"
#include "crc32.hpp"

namespace simcore::configuration {

bool ConfigurationService::initialize(
    IConfigurationStorage& storage,
    const ValidationContext& validation_profile,
    const FactoryPayloads& factory_payloads,
    const std::span<std::uint8_t> record_buffer,
    const std::span<std::uint8_t> payload_buffer,
    const std::span<std::uint8_t> configuration_buffer,
    const StoredDocuments& apply_stored) {
  if (record_buffer.size() < kRecordBufferSize ||
      payload_buffer.size() < kPayloadBufferSize ||
      configuration_buffer.size() < kConfigurationBufferSize) {
    return false;
  }
  active_ = new (configuration_buffer.data()) ApplicationConfiguration{};
  scratch_ = new (configuration_buffer.data() +
                  sizeof(ApplicationConfiguration)) ApplicationConfiguration{};
  record_buffer_ = record_buffer.first(kRecordBufferSize);
  std::span<std::uint8_t> remaining = payload_buffer.first(kPayloadBufferSize);
  for (std::size_t index = 0; index < kConfigurationDocumentCount; ++index) {
    const std::size_t size = kConfigurationDocumentPayloadSizes[index];
    payloads_[index] = remaining.first(size);
    remaining = remaining.subspan(size);
  }
  payload_sizes_ = {};
  storage_ = &storage;
  factory_payloads_ = factory_payloads;
  validation_profile_ = validation_profile;
  status_ = {};

  *scratch_ = {};
  for (std::size_t index = 0; index < kConfigurationDocumentCount; ++index) {
    const auto document = static_cast<ConfigurationDocument>(index);
    const std::span<const std::uint8_t> payload = factory_payloads[index];
    if (payload.empty() || payload.size() > payloads_[index].size() ||
        !parse_configuration_json(document, payload, validation_profile_,
                                  (*scratch_))
             .ok()) {
      return false;
    }
    remember_payload(document, payload);
  }
  promote_scratch();

  status_.storage_available = storage.initialize();
  if (!status_.storage_available) {
    return false;
  }

  for (std::size_t index = 0; index < kConfigurationDocumentCount; ++index) {
    const auto document = static_cast<ConfigurationDocument>(index);
    copy_active_to_scratch();
    const LoadedRecord loaded = load_document(document, (*scratch_));
    status_.documents[index] = loaded.status;
    if (!loaded.valid) {
      continue;
    }
    if (apply_stored[index]) {
      promote_scratch();
    }
    remember_payload(document,
                     std::span<const std::uint8_t>(
                         record_buffer_.data() + kRecordHeaderSize,
                         loaded.payload_size));
  }
  return true;
}

std::span<const std::uint8_t> ConfigurationService::current_payload(
    const ConfigurationDocument document) const {
  const std::size_t index = index_of(document);
  if (index >= payloads_.size()) {
    return {};
  }
  return {payloads_[index].data(), payload_sizes_[index]};
}

ValidationFailure ConfigurationService::validate_payload(
    const ConfigurationDocument document,
    const std::span<const std::uint8_t> payload) const {
  copy_active_to_scratch();
  return parse_configuration_json(document, payload, validation_profile_,
                                  (*scratch_));
}

ConfigurationService::SaveOutcome ConfigurationService::save(
    const ConfigurationDocument document,
    const std::span<const std::uint8_t> payload) {
  if (storage_ == nullptr || !status_.storage_available) {
    return {.storage_failed = true};
  }
  copy_active_to_scratch();
  const ValidationFailure parsed = parse_configuration_json(
      document, payload, validation_profile_, (*scratch_));
  if (!parsed.ok()) {
    return {.failure = parsed};
  }
  const std::size_t index = index_of(document);
  const std::uint32_t generation = status_.documents[index].generation + 1U;
  std::size_t record_size{};
  if (!build_record(payload, generation, record_buffer_, record_size) ||
      !storage_->write(
          document,
          std::span<const std::uint8_t>(record_buffer_.data(), record_size))) {
    return {.storage_failed = true};
  }

  copy_active_to_scratch();
  const LoadedRecord verified = load_document(document, (*scratch_));
  if (!verified.valid || verified.generation != generation) {
    return {.storage_failed = true};
  }
  status_.documents[index] = verified.status;
  remember_payload(document,
                   std::span<const std::uint8_t>(
                       record_buffer_.data() + kRecordHeaderSize,
                       verified.payload_size));
  return {};
}

bool ConfigurationService::erase(const ConfigurationDocument document) {
  if (storage_ == nullptr || !status_.storage_available ||
      !storage_->erase(document)) {
    return false;
  }
  const std::size_t index = index_of(document);
  status_.documents[index] = {};
  remember_payload(document, factory_payloads_[index]);
  return true;
}

bool ConfigurationService::reset() {
  if (storage_ == nullptr || !status_.storage_available ||
      !storage_->reset()) {
    return false;
  }
  for (std::size_t index = 0; index < kConfigurationDocumentCount; ++index) {
    status_.documents[index] = {};
    remember_payload(static_cast<ConfigurationDocument>(index),
                     factory_payloads_[index]);
  }
  return true;
}

ConfigurationService::LoadedRecord ConfigurationService::load_document(
    const ConfigurationDocument document,
    ApplicationConfiguration& configuration) {
  LoadedRecord loaded;
  loaded.status.outcome = DocumentOutcome::absent;
  if (storage_ == nullptr) {
    return loaded;
  }
  std::size_t size{};
  if (!storage_->read(document, record_buffer_, size) || size == 0) {
    return loaded;
  }
  loaded.status.outcome = DocumentOutcome::malformed_record;
  if (size < kRecordHeaderSize || size > record_buffer_.size()) {
    return loaded;
  }
  const std::span<const std::uint8_t> record(record_buffer_.data(), size);
  const std::uint16_t schema_version = binary::read_u16_le(record, 6);
  const std::uint32_t payload_size = binary::read_u32_le(record, 8);
  if (binary::read_u32_le(record, 0) != kRecordMagic ||
      binary::read_u16_le(record, 4) != kRecordVersion ||
      payload_size == 0 ||
      payload_size > configuration_document_payload_size(document) ||
      size != kRecordHeaderSize + payload_size) {
    return loaded;
  }
  if (!is_supported_configuration_schema(schema_version)) {
    loaded.status.outcome = DocumentOutcome::unsupported_schema;
    return loaded;
  }
  const std::span<const std::uint8_t> payload =
      record.subspan(kRecordHeaderSize, payload_size);
  if (binary::crc32(payload) != binary::read_u32_le(record, 16)) {
    loaded.status.outcome = DocumentOutcome::corrupt_payload;
    return loaded;
  }
  const ValidationFailure failure = parse_configuration_json(
      document, payload, validation_profile_, configuration);
  if (!failure.ok()) {
    loaded.status.outcome = DocumentOutcome::rejected;
    loaded.status.failure = failure;
    return loaded;
  }
  loaded.generation = binary::read_u32_le(record, 12);
  loaded.payload_size = payload_size;
  loaded.valid = true;
  loaded.status.outcome = DocumentOutcome::valid;
  loaded.status.generation = loaded.generation;
  return loaded;
}

bool ConfigurationService::build_record(
    const std::span<const std::uint8_t> payload,
    const std::uint32_t generation, const std::span<std::uint8_t> output,
    std::size_t& size) const {
  if (payload.empty() ||
      payload.size() > kMaximumPayloadSize ||
      output.size() < kRecordHeaderSize + payload.size()) {
    return false;
  }
  binary::write_u32_le(output, 0, kRecordMagic);
  binary::write_u16_le(output, 4, kRecordVersion);
  binary::write_u16_le(output, 6, kConfigurationSchemaVersion);
  binary::write_u32_le(output, 8,
                       static_cast<std::uint32_t>(payload.size()));
  binary::write_u32_le(output, 12, generation);
  binary::write_u32_le(output, 16, binary::crc32(payload));
  std::copy(payload.begin(), payload.end(),
            output.begin() + kRecordHeaderSize);
  size = kRecordHeaderSize + payload.size();
  return true;
}

void ConfigurationService::remember_payload(
    const ConfigurationDocument document,
    const std::span<const std::uint8_t> payload) {
  const std::size_t index = index_of(document);
  std::copy(payload.begin(), payload.end(), payloads_[index].begin());
  payload_sizes_[index] = payload.size();
}

ValidationFailure ConfigurationService::stage(
    const ConfigurationDocument document,
    const std::span<const std::uint8_t> payload) {
  copy_active_to_scratch();
  return parse_configuration_json(document, payload, validation_profile_,
                                  (*scratch_));
}

void ConfigurationService::promote() {
  promote_scratch();
}

void ConfigurationService::revert() {
  promote_scratch();
}

void ConfigurationService::promote_scratch() {
  std::swap(active_, scratch_);
}

void ConfigurationService::copy_active_to_scratch() const {
  *scratch_ = *active_;
}

}
