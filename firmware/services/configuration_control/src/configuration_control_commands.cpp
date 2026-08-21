#include <algorithm>
#include <cstdio>
#include <cstring>
#include <string_view>

#include "configuration_control.hpp"
#include "esp_app_desc.h"
#include "transport.hpp"

// The command half of configuration control: what each `@SC:` line means and
// the replies it earns, run on the worker task. The task lifecycle and the
// line intake live in configuration_control.cpp.
namespace simcore::configuration {
namespace {

constexpr std::string_view kPrefix = "@SC:";

}  // namespace

void ConfigurationControl::handle(
    const std::span<const std::uint8_t> line) {
  const std::span<const std::uint8_t> command =
      line.subspan(kPrefix.size());

  if (command.size() == 4 &&
      std::equal(command.begin(), command.end(), "INFO")) {
    const ConfigurationStatus status = service_->status();
    const std::string_view board = board_id_name(service_->hardware_board());
    int written = std::snprintf(
        reinterpret_cast<char*>(io_buffer_.data()), io_buffer_.size(),
        "@SC:OK:INFO:board=%.*s,firmware=%s,schema=%u,storage=%u",
        static_cast<int>(board.size()), board.data(),
        esp_app_get_description()->version,
        static_cast<unsigned>(kConfigurationSchemaVersion),
        status.storage_available ? 1U : 0U);
    // Then one field per document: what became of its stored record, and which
    // generation of it the device is running. A host that finds `absent` knows
    // the board is on that document's factory values rather than having to
    // infer it from a single source token that could only name one of three.
    for (std::size_t index = 0;
         written > 0 && index < kConfigurationDocumentCount; ++index) {
      const auto document = static_cast<ConfigurationDocument>(index);
      const std::string_view name = configuration_document_name(document);
      const std::string_view outcome =
          document_outcome_name(status.documents[index].outcome);
      const int field = std::snprintf(
          reinterpret_cast<char*>(io_buffer_.data()) + written,
          io_buffer_.size() - static_cast<std::size_t>(written),
          ",%.*s=%.*s:%lu", static_cast<int>(name.size()), name.data(),
          static_cast<int>(outcome.size()), outcome.data(),
          static_cast<unsigned long>(status.documents[index].generation));
      if (field <= 0) {
        written = 0;
        break;
      }
      written += field;
    }
    if (written > 0 &&
        static_cast<std::size_t>(written) + 1U < io_buffer_.size()) {
      io_buffer_[static_cast<std::size_t>(written)] = '\n';
      (void)write_reply(std::span<const std::uint8_t>(
          io_buffer_.data(), static_cast<std::size_t>(written) + 1U));
    }
    return;
  }

  ConfigurationDocument document{};
  std::span<const std::uint8_t> payload{};

  constexpr std::string_view kGet = "GET:";
  if (command.size() >= kGet.size() &&
      std::equal(kGet.begin(), kGet.end(), command.begin())) {
    if (take_document(command.subspan(kGet.size()), false, document, payload)) {
      (void)send_payload(document, service_->current_payload(document));
    }
    return;
  }

  constexpr std::string_view kApply = "APPLY:";
  if (command.size() >= kApply.size() &&
      std::equal(kApply.begin(), kApply.end(), command.begin())) {
    if (!take_document(command.subspan(kApply.size()), true, document,
                       payload)) {
      return;
    }
    if (apply_handler_ == nullptr) {
      (void)send_text("@SC:ERR:unsupported\n");
      return;
    }
    const ValidationFailure failure =
        apply_handler_(document, payload, apply_context_);
    if (!failure.ok()) {
      (void)send_error(failure);
      return;
    }
    (void)send_document_reply("@SC:OK:APPLIED", document, nullptr);
    return;
  }

  constexpr std::string_view kValidate = "VALIDATE:";
  if (command.size() >= kValidate.size() &&
      std::equal(kValidate.begin(), kValidate.end(), command.begin())) {
    if (!take_document(command.subspan(kValidate.size()), true, document,
                       payload)) {
      return;
    }
    const ValidationFailure failure =
        service_->validate_payload(document, payload);
    if (!failure.ok()) {
      (void)send_error(failure);
      return;
    }
    (void)send_document_reply("@SC:OK:VALID", document, nullptr);
    return;
  }

  constexpr std::string_view kSet = "SET:";
  if (command.size() >= kSet.size() &&
      std::equal(kSet.begin(), kSet.end(), command.begin())) {
    if (!take_document(command.subspan(kSet.size()), true, document, payload)) {
      return;
    }
    const ConfigurationService::SaveOutcome outcome =
        service_->save(document, payload);
    if (outcome.storage_failed) {
      // The same answer RESET gives when flash refuses it, rather than a
      // validation error over a document that parsed and validated fine.
      (void)send_text("@SC:ERR:storage\n");
      return;
    }
    if (!outcome.failure.ok()) {
      (void)send_error(outcome.failure);
      return;
    }
    // Only the transport is chosen once at startup, so only that document is
    // stored and not in force. The rest are brought up by an APPLY carrying the
    // same bytes, which is what the configurator pairs with this.
    (void)send_document_reply(
        "@SC:OK:SAVED", document,
        configuration_document_reboot_required(document)
            ? "reboot_required=1"
            : "reboot_required=0");
    return;
  }

  if (command.size() == 5 &&
      std::equal(command.begin(), command.end(), "RESET")) {
    if (service_->reset()) {
      (void)send_text("@SC:OK:RESET:reboot_required=1\n");
    } else {
      (void)send_text("@SC:ERR:storage\n");
    }
    return;
  }

  constexpr std::string_view kResetOne = "RESET:";
  if (command.size() >= kResetOne.size() &&
      std::equal(kResetOne.begin(), kResetOne.end(), command.begin())) {
    if (!take_document(command.subspan(kResetOne.size()), false, document,
                       payload)) {
      return;
    }
    if (!service_->erase(document)) {
      (void)send_text("@SC:ERR:storage\n");
      return;
    }
    // Erasing a record does not put the board back on that document's factory
    // values; only a restart reloads it, which is true of every document here.
    (void)send_document_reply("@SC:OK:RESET", document, "reboot_required=1");
    return;
  }

  if (command.size() == 6 &&
      std::equal(command.begin(), command.end(), "REBOOT")) {
    (void)send_text("@SC:OK:REBOOTING\n");
    if (reboot_handler_ != nullptr) {
      reboot_handler_(reboot_context_);
    }
    return;
  }

  (void)send_text("@SC:ERR:unknown_command\n");
}

bool ConfigurationControl::take_document(
    const std::span<const std::uint8_t> argument, const bool expect_payload,
    ConfigurationDocument& document,
    std::span<const std::uint8_t>& payload) {
  const auto separator = std::find(argument.begin(), argument.end(),
                                   static_cast<std::uint8_t>(':'));
  const auto name_size =
      static_cast<std::size_t>(separator - argument.begin());
  if (expect_payload == (separator == argument.end())) {
    // A command that carries a document and a payload needs the colon between
    // them; one that carries only a document must not have anything after it.
    (void)send_text("@SC:ERR:unknown_document\n");
    return false;
  }
  const std::string_view name(
      reinterpret_cast<const char*>(argument.data()), name_size);
  if (!configuration_document_from_name(name, document)) {
    (void)send_text("@SC:ERR:unknown_document\n");
    return false;
  }
  payload = expect_payload ? argument.subspan(name_size + 1U)
                           : std::span<const std::uint8_t>{};
  return true;
}

bool ConfigurationControl::write_reply(
    const std::span<const std::uint8_t> data) {
  transport::ITransport* const link = reply();
  return link != nullptr && link->write(data);
}

bool ConfigurationControl::send_text(const char* const text) {
  return write_reply(std::span<const std::uint8_t>(
      reinterpret_cast<const std::uint8_t*>(text), std::strlen(text)));
}

bool ConfigurationControl::send_error(const ValidationFailure& failure) {
  // The reason token keeps its position so existing hosts still parse it.
  // Location details follow only when the failure has them.
  const std::string_view reason = validation_error_name(failure.error);
  const std::string_view path = text_view(failure.path);
  const int written = std::snprintf(
      reinterpret_cast<char*>(io_buffer_.data()), io_buffer_.size(),
      "@SC:ERR:%.*s:screen=%d,widget=%d,path=%.*s\n",
      static_cast<int>(reason.size()), reason.data(),
      static_cast<int>(failure.screen_index),
      static_cast<int>(failure.widget_index),
      static_cast<int>(path.size()), path.data());
  return written > 0 &&
         static_cast<std::size_t>(written) < io_buffer_.size() &&
         write_reply(
             std::span<const std::uint8_t>(io_buffer_.data(), written));
}

bool ConfigurationControl::send_document_reply(
    const char* const prefix, const ConfigurationDocument document,
    const char* const trailer) {
  const std::string_view name = configuration_document_name(document);
  const int written = std::snprintf(
      reinterpret_cast<char*>(io_buffer_.data()), io_buffer_.size(),
      "%s:%.*s%s%s\n", prefix, static_cast<int>(name.size()), name.data(),
      trailer == nullptr ? "" : ":", trailer == nullptr ? "" : trailer);
  return written > 0 &&
         static_cast<std::size_t>(written) < io_buffer_.size() &&
         write_reply(
             std::span<const std::uint8_t>(io_buffer_.data(), written));
}

bool ConfigurationControl::send_payload(
    const ConfigurationDocument document,
    const std::span<const std::uint8_t> payload) {
  constexpr std::string_view kPayloadPrefix = "@SC:OK:CONFIG:";
  const std::string_view name = configuration_document_name(document);
  // The name and the colon after it sit between the prefix and the payload, so
  // the room they take is counted before anything is copied.
  const std::size_t prefix_size =
      kPayloadPrefix.size() + name.size() + 1U;
  if (prefix_size + payload.size() + 1U > io_buffer_.size()) {
    // The contract defines malformed as covering an oversized payload, so this
    // is the documented answer rather than an approximation of one.
    return send_error({.error = ValidationError::malformed});
  }
  std::size_t position = 0;
  const auto append = [this, &position](const std::string_view text) {
    std::copy(text.begin(), text.end(), io_buffer_.begin() + position);
    position += text.size();
  };
  append(kPayloadPrefix);
  append(name);
  io_buffer_[position++] = ':';
  std::copy(payload.begin(), payload.end(), io_buffer_.begin() + position);
  position += payload.size();
  io_buffer_[position++] = '\n';
  return write_reply(
      std::span<const std::uint8_t>(io_buffer_.data(), position));
}

}  // namespace simcore::configuration
