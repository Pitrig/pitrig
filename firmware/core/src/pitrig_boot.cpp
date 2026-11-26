#include "pitrig_boot.hpp"

#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

#include "application_configuration.hpp"
#include "boot_guard.hpp"
#include "communication_composition.hpp"
#include "configuration_service.hpp"
#include "dashboard_composition.hpp"
#include "display_color.hpp"
#include "display_driver.hpp"
#include "esp_system.h"
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

void finish_panel_check(const bool confirmed, const std::uint8_t panel, void* const context) {
  auto& configuration = static_cast<Application*>(context)->services.configuration;
  if (confirmed) {
    if (!configuration.confirm_panel(panel)) {
      log::warn(kTag, "Display panel %u could not be stored", static_cast<unsigned>(panel));
    }
    return;
  }
  if (!configuration.try_next_panel()) {
    log::warn(kTag, "The next display panel could not be stored; keeping panel %u",
              static_cast<unsigned>(panel));
    return;
  }
  esp_restart();
}

bool host_busy(void* const context) {
  return static_cast<Application*>(context)->communication.host_busy();
}

}

ConfigurationBuffers reserve_configuration_memory(Application& application) {
  static_assert(configuration::ConfigurationControl::kIoBufferSize >=
                configuration::ConfigurationService::kRecordBufferSize);
  constexpr std::size_t kConfigurationMemorySize =
      configuration::ConfigurationService::kPayloadBufferSize +
      configuration::ConfigurationService::kConfigurationBufferSize +
      configuration::ConfigurationControl::kIoBufferSize +
      communication::Router::kBusyLineBufferSize;
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
  const std::span<std::uint8_t> control_io =
      take(configuration::ConfigurationControl::kIoBufferSize);
  return {
      .record = control_io,
      .current_payloads = take(configuration::ConfigurationService::kPayloadBufferSize),
      .control_io = control_io,
      .busy_line = take(communication::Router::kBusyLineBufferSize),
      .configuration = take(configuration::ConfigurationService::kConfigurationBufferSize),
  };
}

configuration::PanelChoice begin_panel(Application& application,
                                       const board_registry::BoardDefinition& board) {
  if (board.display == nullptr) {
    return {};
  }
  const std::uint8_t panel_count = display::driver::panel_count(*board.display);
  if (panel_count <= 1) {
    return {};
  }
  if (!application.platform.configuration_storage.initialize()) {
    log::warn(kTag, "Configuration storage unavailable; driving display panel 0");
    return {};
  }
  const boot_guard::ResetCause cause = boot_guard::status().cause;
  const bool continues_check = cause == boot_guard::ResetCause::software ||
                               cause == boot_guard::ResetCause::panic ||
                               cause == boot_guard::ResetCause::task_watchdog;
  const configuration::PanelChoice panel = configuration::begin_panel(
      application.platform.configuration_storage, panel_count, continues_check);
  log::info(kTag, "Display panel %u of %u%s", static_cast<unsigned>(panel.panel + 1U),
            static_cast<unsigned>(panel_count), panel.check ? ", on trial" : "");
  return panel;
}

void load_configuration(Application& application, const board_registry::BoardDefinition& board,
                        const ConfigurationBuffers& buffers, const std::uint8_t panel) {
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
  configuration::ValidationContext validation = board.validation;
  const display::driver::ColorProfile* const profile =
      board.display != nullptr ? display::driver::color_profile(*board.display, panel) : nullptr;
  if (profile != nullptr) {
    application.color_correction.emplace(*profile);
    if (application.color_correction->valid()) {
      validation.dashboard_colors = &*application.color_correction;
    } else {
      application.color_correction.reset();
      log::warn(kTag, "Display colour profile unusable; colours stay uncorrected");
    }
  }
  if (!application.services.configuration.initialize(
          application.platform.configuration_storage, validation, factory, buffers.record,
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

void start_panel_check(Application& application, const board_registry::BoardDefinition& board,
                       const configuration::PanelChoice panel, const bool touch) {
  if (!panel.check || application.display == nullptr || board.display == nullptr) {
    return;
  }
  if (!touch) {
    log::warn(kTag, "No touch input on this start; the display panel check waits for the next");
    return;
  }
  if (!dashboard_composition::show_panel_check(application.display, panel.panel,
                                              display::driver::panel_count(*board.display),
                                              finish_panel_check, host_busy, &application)) {
    log::warn(kTag, "The display panel check could not be shown");
  }
}

}
