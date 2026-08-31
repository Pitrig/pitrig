#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

#include "telemetry_registry.hpp"
#include "text_widget.hpp"

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::dashboard::text_widget {

using ModifierReaders = frame::ModifierReaders;

using BoundConfig = frame::BoundSource;

inline constexpr std::size_t kContextsPerInstance = kMaximumSources + 2;

struct WidgetBinding {
  std::array<BoundConfig, kMaximumSources> sources{};
  std::size_t count{};
  BoundConfig condition{};
  BoundConfig caption{};
};

class Binder final {
 public:
  [[nodiscard]] bool bind(
      std::span<const Config> configurations,
      const telemetry::ITelemetryRegistry& registry,
      const telemetry::ITelemetryReader& telemetry,
      const ModifierReaders& modifier_readers);

  [[nodiscard]] std::span<const WidgetBinding> bindings() const;

 private:
  struct SourceContext {
    const telemetry::ITelemetryReader* telemetry{};
    telemetry::Handle handle{};
  };

  [[nodiscard]] bool bind_sources(
      const Config& configuration, std::size_t instance,
      const telemetry::ITelemetryRegistry& registry,
      const telemetry::ITelemetryReader& telemetry,
      const ModifierReaders& modifier_readers, WidgetBinding& binding);

  [[nodiscard]] bool bind_one(
      std::string_view name, std::uint8_t modifier_count,
      std::span<const configuration::ValueModifier> modifiers,
      const telemetry::ITelemetryRegistry& registry,
      const telemetry::ITelemetryReader& telemetry,
      const ModifierReaders& modifier_readers, std::size_t context_index,
      BoundConfig& bound);

  [[nodiscard]] static telemetry::TelemetryRead read_telemetry(void* context);

  std::array<WidgetBinding, kMaximumInstances> bindings_{};
  std::array<SourceContext, kMaximumInstances * kContextsPerInstance>
      source_contexts_{};
  std::size_t count_{};
};

}
