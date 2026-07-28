#include "configuration_control.hpp"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <string_view>

namespace simcore::configuration {
namespace {

constexpr std::string_view kPrefix = "@SC:";

int hex_value(const std::uint8_t value) {
  if (value >= '0' && value <= '9') {
    return value - '0';
  }
  if (value >= 'a' && value <= 'f') {
    return value - 'a' + 10;
  }
  if (value >= 'A' && value <= 'F') {
    return value - 'A' + 10;
  }
  return -1;
}

bool decode_hex(const std::span<const std::uint8_t> encoded,
                const std::span<std::uint8_t> output, std::size_t& size) {
  if (encoded.empty() || (encoded.size() % 2U) != 0 ||
      encoded.size() / 2U > output.size()) {
    return false;
  }
  size = encoded.size() / 2U;
  for (std::size_t index = 0; index < size; ++index) {
    const int high = hex_value(encoded[index * 2U]);
    const int low = hex_value(encoded[index * 2U + 1U]);
    if (high < 0 || low < 0) {
      return false;
    }
    output[index] = static_cast<std::uint8_t>((high << 4) | low);
  }
  return true;
}

char hex_digit(const std::uint8_t value) {
  return static_cast<char>(value < 10 ? '0' + value : 'A' + value - 10);
}

}  // namespace

void ConfigurationControl::initialize(
    ConfigurationService& service, transport::ITransport& transport,
    const RebootHandler reboot_handler, void* const reboot_context) {
  service_ = &service;
  transport_ = &transport;
  reboot_handler_ = reboot_handler;
  reboot_context_ = reboot_context;
}

void ConfigurationControl::consume(
    const std::span<const std::uint8_t> line) {
  if (service_ == nullptr || transport_ == nullptr ||
      line.size() < kPrefix.size() ||
      !std::equal(kPrefix.begin(), kPrefix.end(), line.begin())) {
    return;
  }
  const std::span<const std::uint8_t> command =
      line.subspan(kPrefix.size());

  if (command.size() == 4 &&
      std::equal(command.begin(), command.end(), "INFO")) {
    const ConfigurationStatus status = service_->status();
    const char* source = "factory";
    if (status.source == ConfigurationSource::slot_a) {
      source = "slot_a";
    } else if (status.source == ConfigurationSource::slot_b) {
      source = "slot_b";
    }
    const int written = std::snprintf(
        reinterpret_cast<char*>(response_.data()), response_.size(),
        "@SC:OK:INFO:schema=%u,source=%s,generation=%lu,storage=%u\n",
        static_cast<unsigned>(kConfigurationSchemaVersion), source,
        static_cast<unsigned long>(status.generation),
        status.storage_available ? 1U : 0U);
    if (written > 0 && static_cast<std::size_t>(written) < response_.size()) {
      transport_->write(
          std::span<const std::uint8_t>(response_.data(), written));
    }
    return;
  }

  if (command.size() == 3 &&
      std::equal(command.begin(), command.end(), "GET")) {
    const CodecResult encoded = service_->encode_current(payload_);
    if (!encoded.ok) {
      send_error(encoded.error);
      return;
    }
    send_payload(
        std::span<const std::uint8_t>(payload_.data(), encoded.size));
    return;
  }

  constexpr std::string_view kValidate = "VALIDATE:";
  constexpr std::string_view kSet = "SET:";
  const bool validate =
      command.size() >= kValidate.size() &&
      std::equal(kValidate.begin(), kValidate.end(), command.begin());
  const bool set =
      command.size() >= kSet.size() &&
      std::equal(kSet.begin(), kSet.end(), command.begin());
  if (validate || set) {
    const std::size_t prefix_size =
        validate ? kValidate.size() : kSet.size();
    std::size_t payload_size{};
    if (!decode_hex(command.subspan(prefix_size), payload_, payload_size)) {
      send_error(ValidationError::malformed);
      return;
    }
    const std::span<const std::uint8_t> payload(payload_.data(),
                                                payload_size);
    const ValidationError error =
        validate ? service_->validate_payload(payload)
                 : service_->save(payload);
    if (error != ValidationError::none) {
      send_error(error);
      return;
    }
    send_text(validate ? "@SC:OK:VALID\n"
                       : "@SC:OK:SAVED:reboot_required=1\n");
    return;
  }

  if (command.size() == 5 &&
      std::equal(command.begin(), command.end(), "RESET")) {
    if (service_->reset()) {
      send_text("@SC:OK:RESET:reboot_required=1\n");
    } else {
      send_text("@SC:ERR:storage\n");
    }
    return;
  }

  if (command.size() == 6 &&
      std::equal(command.begin(), command.end(), "REBOOT")) {
    send_text("@SC:OK:REBOOTING\n");
    if (reboot_handler_ != nullptr) {
      reboot_handler_(reboot_context_);
    }
    return;
  }

  send_text("@SC:ERR:unknown_command\n");
}

void ConfigurationControl::send_text(const char* const text) {
  transport_->write(std::span<const std::uint8_t>(
      reinterpret_cast<const std::uint8_t*>(text), std::strlen(text)));
}

void ConfigurationControl::send_error(const ValidationError error) {
  const int written = std::snprintf(
      reinterpret_cast<char*>(response_.data()), response_.size(),
      "@SC:ERR:%s\n", validation_error_name(error));
  if (written > 0 && static_cast<std::size_t>(written) < response_.size()) {
    transport_->write(
        std::span<const std::uint8_t>(response_.data(), written));
  }
}

void ConfigurationControl::send_payload(
    const std::span<const std::uint8_t> payload) {
  constexpr char prefix[] = "@SC:OK:CONFIG:";
  constexpr std::size_t prefix_size = sizeof(prefix) - 1;
  if (prefix_size + payload.size() * 2U + 1U > response_.size()) {
    send_error(ValidationError::malformed);
    return;
  }
  std::copy_n(reinterpret_cast<const std::uint8_t*>(prefix), prefix_size,
              response_.begin());
  std::size_t position = prefix_size;
  for (const std::uint8_t value : payload) {
    response_[position++] =
        static_cast<std::uint8_t>(hex_digit(value >> 4U));
    response_[position++] =
        static_cast<std::uint8_t>(hex_digit(value & 0x0FU));
  }
  response_[position++] = '\n';
  transport_->write(
      std::span<const std::uint8_t>(response_.data(), position));
}

}  // namespace simcore::configuration
