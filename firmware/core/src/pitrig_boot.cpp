#include "pitrig_boot.hpp"

#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

#include "application_configuration.hpp"
#include "boot_guard.hpp"
#include "communication_composition.hpp"
#include "configuration_service.hpp"
#include "font_asset_service.hpp"
#include "image_asset_service.hpp"
#include "logger.hpp"

namespace pitrig::boot {
namespace {

constexpr char kTag[] = "pitrig";

void report_document(const configuration::ConfigurationDocument document,
                     const configuration::DocumentStatus& status) {
  using configuration::DocumentOutcome;
  const std::string_view name = configuration_document_name(document);
  switch (status.outcome) {
    case DocumentOutcome::absent:
      log::info(kTag, "No stored %.*s configuration; using factory defaults",
                static_cast<int>(name.size()), name.data());
      return;
    case DocumentOutcome::valid:
      log::info(kTag, "Configuration %.*s loaded, generation %lu", static_cast<int>(name.size()),
                name.data(), static_cast<unsigned long>(status.generation));
      return;
    case DocumentOutcome::malformed_record:
      log::warn(kTag, "Configuration %.*s holds a malformed record; ignored",
                static_cast<int>(name.size()), name.data());
      return;
    case DocumentOutcome::unsupported_schema:
      log::warn(kTag,
                "Configuration %.*s was written for another schema version; "
                "ignored",
                static_cast<int>(name.size()), name.data());
      return;
    case DocumentOutcome::corrupt_payload:
      log::warn(kTag, "Configuration %.*s failed its checksum; ignored",
                static_cast<int>(name.size()), name.data());
      return;
    case DocumentOutcome::rejected: {
      const std::string_view reason = configuration::validation_error_name(status.failure.error);
      log::warn(kTag, "Configuration %.*s rejected: %.*s at %s; ignored",
                static_cast<int>(name.size()), name.data(), static_cast<int>(reason.size()),
                reason.data(), status.failure.path.data());
      return;
    }
  }
}

}

ConfigurationBuffers reserve_configuration_memory(Application& application) {
  constexpr std::size_t kConfigurationMemorySize =
      configuration::ConfigurationService::kRecordBufferSize +
      configuration::ConfigurationService::kPayloadBufferSize +
      configuration::ConfigurationService::kConfigurationBufferSize +
      configuration::ConfigurationControl::kIoBufferSize +
      communication::Router::kControlLineBufferSize;
  if (!application.platform.configuration_memory.initialize(kConfigurationMemorySize)) {
    log::error(kTag,
               "Configuration memory needs %lu bytes of external RAM and did "
               "not get them; this board cannot start a link",
               static_cast<unsigned long>(kConfigurationMemorySize));
    return {};
  }
  std::span<std::uint8_t> memory = application.platform.configuration_memory.bytes();
  const auto take = [&memory](const std::size_t size) {
    const std::span<std::uint8_t> buffer = memory.first(size);
    memory = memory.subspan(size);
    return buffer;
  };
  return {
      .record = take(configuration::ConfigurationService::kRecordBufferSize),
      .current_payloads = take(configuration::ConfigurationService::kPayloadBufferSize),
      .control_io = take(configuration::ConfigurationControl::kIoBufferSize),
      .control_line = take(communication::Router::kControlLineBufferSize),
      .configuration = take(configuration::ConfigurationService::kConfigurationBufferSize),
  };
}

void load_configuration(Application& application, const board_registry::BoardDefinition& board,
                        const ConfigurationBuffers& buffers) {
  configuration::ConfigurationService::FactoryPayloads factory{};
  for (std::size_t index = 0; index < configuration::kConfigurationDocumentCount; ++index) {
    const std::string_view json = board.factory_configuration_json[index];
    factory[index] = std::span<const std::uint8_t>(
        reinterpret_cast<const std::uint8_t*>(json.data()), json.size());
  }
  auto apply_stored = configuration::ConfigurationService::all_stored_documents();
  if (boot_guard::safe_mode()) {
    apply_stored[static_cast<std::size_t>(configuration::ConfigurationDocument::protocol)] = false;
  }
  if (!application.services.configuration.initialize(
          application.platform.configuration_storage, board.validation, factory, buffers.record,
          buffers.current_payloads, buffers.configuration, apply_stored)) {
    log::warn(kTag, "Configuration storage unavailable; using factory defaults");
  }
  const configuration::ConfigurationStatus status = application.services.configuration.status();
  for (std::size_t index = 0; index < configuration::kConfigurationDocumentCount; ++index) {
    report_document(static_cast<configuration::ConfigurationDocument>(index),
                    status.documents[index]);
  }
}

void open_asset_storage(Application& application) {
  if (!application.services.font_assets.initialize(application.platform.font_asset_storage)) {
    log::warn(kTag, "Font asset storage unavailable");
  }
  if (!application.services.image_assets.initialize(application.platform.image_asset_storage)) {
    log::warn(kTag, "Image asset storage unavailable");
  }
}

}
