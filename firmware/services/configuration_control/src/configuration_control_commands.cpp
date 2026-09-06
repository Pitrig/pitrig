#include <algorithm>
#include <array>
#include <cstdio>
#include <cstring>
#include <string_view>

#include "boot_guard.hpp"
#include "configuration_control.hpp"
#include "transport.hpp"

namespace pitrig::configuration {
namespace {

[[nodiscard]] bool changes_the_device(
    const std::span<const std::uint8_t> command) {
  constexpr std::array<std::string_view, 3> kWriting{"APPLY:", "SET:", "RESET"};
  for (const std::string_view word : kWriting) {
    if (command.size() >= word.size() &&
        std::equal(word.begin(), word.end(), command.begin())) {
      return true;
    }
  }
  return false;
}

}

void ConfigurationControl::handle(
    const std::span<const std::uint8_t> line) {
  const std::span<const std::uint8_t> command =
      line.subspan(kControlPrefix.size());

  if (command.size() == 4 &&
      std::equal(command.begin(), command.end(), "INFO")) {
    send_info();
    return;
  }

  if (command.size() == 4 &&
      std::equal(command.begin(), command.end(), "DIAG")) {
    send_diagnostics();
    return;
  }

  if (changes_the_device(command) && !await_composition()) {
    (void)send_text("@PR:ERR:busy\n");
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
      (void)send_text("@PR:ERR:unsupported\n");
      return;
    }
    const ValidationFailure failure =
        apply_handler_(document, payload, apply_context_);
    if (!failure.ok()) {
      (void)send_error(failure);
      return;
    }
    (void)send_document_reply("@PR:OK:APPLIED", document, nullptr);
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
    (void)send_document_reply("@PR:OK:VALID", document, nullptr);
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
      (void)send_text("@PR:ERR:storage\n");
      return;
    }
    if (!outcome.failure.ok()) {
      (void)send_error(outcome.failure);
      return;
    }
    boot_guard::clear_failures();
    (void)send_document_reply(
        "@PR:OK:SAVED", document,
        configuration_document_reboot_required(document)
            ? "reboot_required=1"
            : "reboot_required=0");
    return;
  }

  if (command.size() == 5 &&
      std::equal(command.begin(), command.end(), "RESET")) {
    if (service_->reset()) {
      boot_guard::clear_failures();
      (void)send_text("@PR:OK:RESET:reboot_required=1\n");
    } else {
      (void)send_text("@PR:ERR:storage\n");
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
      (void)send_text("@PR:ERR:storage\n");
      return;
    }
    boot_guard::clear_failures();
    (void)send_document_reply("@PR:OK:RESET", document, "reboot_required=1");
    return;
  }

  if (command.size() == 6 &&
      std::equal(command.begin(), command.end(), "REBOOT")) {
    (void)send_text("@PR:OK:REBOOTING\n");
    if (reboot_handler_ != nullptr) {
      reboot_handler_(reboot_context_);
    }
    return;
  }

  (void)send_text("@PR:ERR:unknown_command\n");
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
    (void)send_text("@PR:ERR:unknown_document\n");
    return false;
  }
  const std::string_view name(
      reinterpret_cast<const char*>(argument.data()), name_size);
  if (!configuration_document_from_name(name, document)) {
    (void)send_text("@PR:ERR:unknown_document\n");
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
  const std::string_view reason = validation_error_name(failure.error);
  const std::string_view path = text_view(failure.path);
  const int written = std::snprintf(
      reinterpret_cast<char*>(io_buffer_.data()), io_buffer_.size(),
      "@PR:ERR:%.*s:screen=%d,widget=%d,path=%.*s\n",
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
  constexpr std::string_view kPayloadPrefix = "@PR:OK:CONFIG:";
  const std::string_view name = configuration_document_name(document);
  const std::size_t prefix_size =
      kPayloadPrefix.size() + name.size() + 1U;
  if (prefix_size + payload.size() + 1U > io_buffer_.size()) {
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

}
