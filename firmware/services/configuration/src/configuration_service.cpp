#include "configuration_service.hpp"

#include <algorithm>

namespace simcore::configuration {
namespace {

void put_u16(std::span<std::uint8_t> output, const std::size_t offset,
             const std::uint16_t value) {
  output[offset] = static_cast<std::uint8_t>(value);
  output[offset + 1] = static_cast<std::uint8_t>(value >> 8U);
}

void put_u32(std::span<std::uint8_t> output, const std::size_t offset,
             const std::uint32_t value) {
  for (std::size_t index = 0; index < 4; ++index) {
    output[offset + index] =
        static_cast<std::uint8_t>(value >> (index * 8U));
  }
}

std::uint16_t get_u16(const std::span<const std::uint8_t> input,
                      const std::size_t offset) {
  return static_cast<std::uint16_t>(input[offset]) |
         static_cast<std::uint16_t>(input[offset + 1]) << 8U;
}

std::uint32_t get_u32(const std::span<const std::uint8_t> input,
                      const std::size_t offset) {
  std::uint32_t value{};
  for (std::size_t index = 0; index < 4; ++index) {
    value |= static_cast<std::uint32_t>(input[offset + index])
             << (index * 8U);
  }
  return value;
}

std::uint32_t crc32(const std::span<const std::uint8_t> data) {
  std::uint32_t crc = 0xFFFFFFFFU;
  for (const std::uint8_t value : data) {
    crc ^= value;
    for (std::uint8_t bit = 0; bit < 8; ++bit) {
      const std::uint32_t mask =
          0U - static_cast<std::uint32_t>(crc & 1U);
      crc = (crc >> 1U) ^ (0xEDB88320U & mask);
    }
  }
  return ~crc;
}

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
    const ApplicationConfiguration& factory_configuration) {
  storage_ = &storage;
  hardware_board_ = factory_configuration.board.id;
  current_ = factory_configuration;
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
    status_.source = source_for(selected_slot);
    status_.generation = selected.generation;
    if (!has_active || selected_slot != active) {
      storage.set_active(selected_slot);
    }
  }
  return true;
}

CodecResult ConfigurationService::encode_current(
    const std::span<std::uint8_t> output) const {
  return encode_configuration(current_, output);
}

ValidationError ConfigurationService::validate_payload(
    const std::span<const std::uint8_t> payload) const {
  const CodecResult decoded =
      decode_configuration(payload, scratch_configuration_);
  if (!decoded.ok) {
    return decoded.error;
  }
  return scratch_configuration_.board.id == hardware_board_
             ? ValidationError::none
             : ValidationError::board_mismatch;
}

ValidationError ConfigurationService::save(
    const std::span<const std::uint8_t> payload) {
  if (storage_ == nullptr || !status_.storage_available) {
    return ValidationError::malformed;
  }
  const CodecResult decoded =
      decode_configuration(payload, scratch_configuration_);
  if (!decoded.ok) {
    return decoded.error;
  }
  if (scratch_configuration_.board.id != hardware_board_) {
    return ValidationError::board_mismatch;
  }

  StorageSlot active = StorageSlot::a;
  const bool has_active = storage_->read_active(active);
  const StorageSlot target = has_active ? other(active) : StorageSlot::a;
  const std::uint32_t generation = status_.generation + 1U;
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
  status_.generation = generation;
  return ValidationError::none;
}

bool ConfigurationService::reset() {
  if (storage_ == nullptr || !status_.storage_available ||
      !storage_->reset()) {
    return false;
  }
  status_.source = ConfigurationSource::factory;
  status_.generation = 0;
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
  const std::uint16_t schema_version = get_u16(record, 6);
  const std::uint32_t payload_size = get_u32(record, 8);
  if (get_u32(record, 0) != kRecordMagic ||
      get_u16(record, 4) != kRecordVersion ||
      !is_supported_configuration_schema(schema_version) ||
      payload_size < sizeof(std::uint16_t) ||
      payload_size > kMaximumPayloadSize ||
      size != kRecordHeaderSize + payload_size) {
    return loaded;
  }
  const std::span<const std::uint8_t> payload =
      record.subspan(kRecordHeaderSize, payload_size);
  if (get_u16(payload, 0) != schema_version ||
      crc32(payload) != get_u32(record, 16)) {
    return loaded;
  }
  const CodecResult decoded = decode_configuration(payload, configuration);
  if (!decoded.ok) {
    return loaded;
  }
  if (configuration.board.id != hardware_board_) {
    return loaded;
  }
  loaded.generation = get_u32(record, 12);
  loaded.valid = true;
  return loaded;
}

bool ConfigurationService::build_record(
    const std::span<const std::uint8_t> payload,
    const std::uint32_t generation, const std::span<std::uint8_t> output,
    std::size_t& size) const {
  if (payload.size() < sizeof(std::uint16_t) ||
      payload.size() > kMaximumPayloadSize ||
      output.size() < kRecordHeaderSize + payload.size()) {
    return false;
  }
  const std::uint16_t schema_version = get_u16(payload, 0);
  if (!is_supported_configuration_schema(schema_version)) {
    return false;
  }
  put_u32(output, 0, kRecordMagic);
  put_u16(output, 4, kRecordVersion);
  put_u16(output, 6, schema_version);
  put_u32(output, 8, static_cast<std::uint32_t>(payload.size()));
  put_u32(output, 12, generation);
  put_u32(output, 16, crc32(payload));
  std::copy(payload.begin(), payload.end(),
            output.begin() + kRecordHeaderSize);
  size = kRecordHeaderSize + payload.size();
  return true;
}

}  // namespace simcore::configuration
