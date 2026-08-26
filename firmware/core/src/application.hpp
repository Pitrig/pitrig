#pragma once

#include <array>
#include <cstddef>
#include <span>

#include "communication_composition.hpp"
#include "configuration_service.hpp"
#include "event_bus.hpp"
#include "external_memory_buffer.hpp"
#include "firmware_update_service.hpp"
#include "font_asset_service.hpp"
#include "image_asset_service.hpp"
#include "module_composition.hpp"
#include "nvs_config_storage.hpp"
#include "partition_asset_storage.hpp"
#include "telemetry_provider.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_state.hpp"
#include "telemetry_transport_composition.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore {

struct PlatformAdapters {
  configuration::NvsConfigurationStorage configuration_storage;
  platform::PartitionStorage font_asset_storage{"font_assets",
                                                font_assets::kStorageSize};
  platform::PartitionStorage image_asset_storage{"image_assets",
                                                 image_assets::kStorageSize};
  transport::TelemetryComposition telemetry_transport;
  platform::ExternalMemoryBuffer configuration_memory;
  platform::ExternalMemoryBuffer font_memory;
  platform::ExternalMemoryBuffer image_memory;
};

struct ApplicationServices {
  configuration::ConfigurationService configuration;
  firmware_update::Service firmware_update;
  font_assets::Service font_assets;
  image_assets::Service image_assets;
  events::EventBus event_bus;
  telemetry::TelemetryRegistry telemetry_registry;
  telemetry::TelemetryStateService telemetry_state{telemetry_registry};
  telemetry::TelemetryProvider telemetry_provider{telemetry_state, event_bus};
};

struct Application {
  PlatformAdapters platform;
  ApplicationServices services;
  module_composition::Modules modules;
  communication::Composition communication{services.telemetry_registry};
  lv_display_t* display{};
  std::array<transport::ITransport*,
             communication::Composition::kMaximumLinks>
      telemetry_transports{};
  std::size_t telemetry_link_count{};
};

struct ConfigurationBuffers {
  std::span<std::uint8_t> record;
  std::span<std::uint8_t> current_payloads;
  std::span<std::uint8_t> control_io;
  std::span<std::uint8_t> control_line;
  std::span<std::uint8_t> configuration;
};

[[nodiscard]] transport::ITransport& primary_transport(Application& application);

[[nodiscard]] bool recompose(Application& application);

configuration::ValidationFailure apply_configuration(
    configuration::ConfigurationDocument document,
    std::span<const std::uint8_t> payload, void* context);

}
