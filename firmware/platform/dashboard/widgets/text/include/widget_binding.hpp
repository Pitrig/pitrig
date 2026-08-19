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

// The same modifier table every other widget type binds through. A text widget
// resolves several sources rather than one, but a modifier replaces a reading
// identically, so the type is shared rather than restated.
using ModifierReaders = frame::ModifierReaders;

// A resolved value pipeline for one source. It deliberately holds no pointer
// into the configuration document: the binder owns everything here, and the
// matching Config is passed alongside as a parallel span, so a configuration
// buffer can be replaced without leaving the binder pointing at stale storage.
struct BoundConfig {
  ValueReadCallback read{};
  void* read_context{};
  bool fast_updates{};
};

// The resolved sources of one widget, in authored order, plus the source its
// styling rules watch. A widget without rules leaves `condition` empty.
struct WidgetBinding {
  std::array<BoundConfig, kMaximumSources> sources{};
  std::size_t count{};
  BoundConfig condition{};
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
      const Config& configuration,
      const telemetry::ITelemetryRegistry& registry,
      const telemetry::ITelemetryReader& telemetry,
      const ModifierReaders& modifier_readers, WidgetBinding& binding);

  // Resolves one canonical name plus its modifiers into a read callback. The
  // sources of a widget and the source its rules watch differ only in the
  // configuration structure that carries them.
  [[nodiscard]] bool bind_one(
      std::string_view name, std::uint8_t modifier_count,
      std::span<const configuration::ValueModifier> modifiers,
      const telemetry::ITelemetryRegistry& registry,
      const telemetry::ITelemetryReader& telemetry,
      const ModifierReaders& modifier_readers, BoundConfig& bound);

  [[nodiscard]] static telemetry::TelemetryRead read_telemetry(void* context);

  std::array<WidgetBinding, kMaximumInstances> bindings_{};
  // One context per source, plus the condition source each widget may add.
  std::array<SourceContext, kMaximumInstances*(kMaximumSources + 1)>
      source_contexts_{};
  std::size_t count_{};
  std::size_t context_count_{};
};

}  // namespace simcore::dashboard::text_widget
