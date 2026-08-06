#include "configuration_service.hpp"

#include <algorithm>

#include "binary_codec.hpp"
#include "crc32.hpp"

namespace simcore::configuration {
namespace {

ConfigurationSource source_for(const StorageSlot slot) {
  return slot == StorageSlot::a ? ConfigurationSource::slot_a
                                : ConfigurationSource::slot_b;
}

StorageSlot other(const StorageSlot slot) {
  return slot == StorageSlot::a ? StorageSlot::b : StorageSlot::a;
}

}  // namespace

bool ConfigurationService::initialize(
    IConfigurationStorage& storage,
    const ValidationContext& validation_profile,
    const std::span<const std::uint8_t> factory_payload) {
  storage_ = &storage;
  validation_profile_ = validation_profile;
  has_persisted_slot_ = false;
  persisted_generation_ = 0;
  if (factory_payload.empty() ||
      factory_payload.size() > current_payload_.size() ||
      parse_configuration_json(factory_payload, validation_profile_,
                               scratch_configuration_) !=
          ValidationError::none) {
    return false;
  }
  current_ = scratch_configuration_;
  std::copy(factory_payload.begin(), factory_payload.end(),
            current_payload_.begin());
  current_payload_size_ = factory_payload.size();
  status_ = {};
  status_.storage_available = storage.initialize();
  if (!status_.storage_available) {
    return false;
  }

  StorageSlot active{};
  const bool has_active = storage.read_active(active);

  StorageSlot selected_slot = StorageSlot::a;
  LoadedRecord selected{};
  if (has_active) {
    selected = load_slot(active, scratch_configuration_);
    if (selected.valid) {
      selected_slot = active;
    } else {
      selected_slot = other(active);
      selected = load_slot(selected_slot, scratch_configuration_);
    }
  } else {
    const LoadedRecord slot_a =
        load_slot(StorageSlot::a, scratch_configuration_);
    const LoadedRecord slot_b =
        load_slot(StorageSlot::b, scratch_configuration_);
    if (slot_a.valid &&
        (!slot_b.valid || slot_a.generation >= slot_b.generation)) {
      selected_slot = StorageSlot::a;
      selected = load_slot(selected_slot, scratch_configuration_);
    } else if (slot_b.valid) {
      selected_slot = StorageSlot::b;
      selected = load_slot(selected_slot, scratch_configuration_);
    }
  }

  if (selected.valid) {
    current_ = scratch_configuration_;
    const std::uint32_t payload_size = binary::read_u32_le(record_buffer_, 8);
    std::copy_n(record_buffer_.begin() + kRecordHeaderSize, payload_size,
                current_payload_.begin());
    current_payload_size_ = payload_size;
    status_.source = source_for(selected_slot);
    status_.generation = selected.generation;
    persisted_slot_ = selected_slot;
    persisted_generation_ = selected.generation;
    has_persisted_slot_ = true;
    if (!has_active || selected_slot != active) {
      // Keep the selected valid slot in memory even if repairing the marker
      // fails. Subsequent saves still target the opposite slot and cannot
      // overwrite the only verified record.
      (void)storage.set_active(selected_slot);
    }
  }
  return true;
}

ValidationError ConfigurationService::validate_payload(
    const std::span<const std::uint8_t> payload) const {
  const ValidationError parsed =
      parse_configuration_json(payload, validation_profile_,
                               scratch_configuration_);
  if (parsed != ValidationError::none) {
    return parsed;
  }
  return ValidationError::none;
}

ValidationError ConfigurationService::save(
    const std::span<const std::uint8_t> payload) {
  if (storage_ == nullptr || !status_.storage_available) {
    return ValidationError::malformed;
  }
  const ValidationError parsed =
      parse_configuration_json(payload, validation_profile_,
                               scratch_configuration_);
  if (parsed != ValidationError::none) {
    return parsed;
  }
  const StorageSlot target =
      has_persisted_slot_ ? other(persisted_slot_) : StorageSlot::a;
  const std::uint32_t generation = persisted_generation_ + 1U;
  std::size_t record_size{};
  if (!build_record(payload, generation, record_buffer_, record_size) ||
      !storage_->write(
          target,
          std::span<const std::uint8_t>(record_buffer_.data(), record_size))) {
    return ValidationError::malformed;
  }

  const LoadedRecord verified =
      load_slot(target, scratch_configuration_);
  if (!verified.valid || verified.generation != generation ||
      !storage_->set_active(target)) {
    return ValidationError::malformed;
  }
  persisted_slot_ = target;
  persisted_generation_ = generation;
  has_persisted_slot_ = true;
  return ValidationError::none;
}

bool ConfigurationService::reset() {
  if (storage_ == nullptr || !status_.storage_available ||
      !storage_->reset()) {
    return false;
  }
  has_persisted_slot_ = false;
  persisted_generation_ = 0;
  return true;
}

ConfigurationService::LoadedRecord ConfigurationService::load_slot(
    const StorageSlot slot, ApplicationConfiguration& configuration) {
  LoadedRecord loaded;
  if (storage_ == nullptr) {
    return loaded;
  }
  std::size_t size{};
  if (!storage_->read(slot, record_buffer_, size) ||
      size < kRecordHeaderSize || size > record_buffer_.size()) {
    return loaded;
  }
  const std::span<const std::uint8_t> record(record_buffer_.data(), size);
  const std::uint16_t schema_version = binary::read_u16_le(record, 6);
  const std::uint32_t payload_size = binary::read_u32_le(record, 8);
  if (binary::read_u32_le(record, 0) != kRecordMagic ||
      binary::read_u16_le(record, 4) != kRecordVersion ||
      !is_supported_configuration_schema(schema_version) ||
      payload_size == 0 ||
      payload_size > kMaximumPayloadSize ||
      size != kRecordHeaderSize + payload_size) {
    return loaded;
  }
  const std::span<const std::uint8_t> payload =
      record.subspan(kRecordHeaderSize, payload_size);
  if (binary::crc32(payload) != binary::read_u32_le(record, 16)) {
    return loaded;
  }
  if (parse_configuration_json(payload, validation_profile_, configuration) !=
      ValidationError::none) {
    return loaded;
  }
  loaded.generation = binary::read_u32_le(record, 12);
  loaded.valid = true;
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

}  // namespace simcore::configuration
