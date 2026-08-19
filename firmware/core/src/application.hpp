#pragma once

#include <array>
#include <cstddef>
#include <span>

#include "communication_composition.hpp"
#include "configuration_service.hpp"
#include "event_bus.hpp"
#include "external_memory_buffer.hpp"
#include "font_asset_service.hpp"
#include "image_asset_service.hpp"
#include "module_composition.hpp"
#include "nvs_config_storage.hpp"
#include "partition_asset_storage.hpp"
#include "telemetry_provider.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_state.hpp"
#include "telemetry_transport_composition.hpp"

// The display is an opaque handle here, the same forward declaration the
// display component and the dashboard composition make: the core holds it and
// hands it on, and reaches no LVGL header to do so.
struct _lv_display_t;
using lv_display_t = _lv_display_t;

// Everything the composition root statically owns, and the two operations that
// both startup and a runtime replacement need. Startup and the replacement
// transaction are separate files over this, because they answer different
// questions: one brings the device up in order, the other swaps a document
// under a running dashboard without leaving it broken.
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
  // In priority order: the board's configured transport, then any development
  // link attached behind it.
  std::array<transport::ITransport*,
             communication::Composition::kMaximumLinks>
      telemetry_transports{};
  std::size_t telemetry_link_count{};
};

// The workspaces the configuration path needs, all carved from one external
// memory reservation so ~8.5 KiB of bounded documents and line buffers stay off
// the internal heap.
struct ConfigurationBuffers {
  std::span<std::uint8_t> record;
  std::span<std::uint8_t> current_payload;
  std::span<std::uint8_t> control_io;
  std::span<std::uint8_t> control_line;
  std::span<std::uint8_t> configuration;
};

// The overlay reads transport diagnostics from the board's own link.
[[nodiscard]] transport::ITransport& primary_transport(Application& application);

// Rebuilds module lifecycle and the dashboard from the active configuration.
[[nodiscard]] bool recompose(Application& application);

// Applies a replacement to the running composition, in the order ADR 0016
// requires. Runs on the configuration control task, which may take the LVGL
// lock.
configuration::ValidationFailure apply_configuration(
    std::span<const std::uint8_t> payload, void* context);

}  // namespace simcore
