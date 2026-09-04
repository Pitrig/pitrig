#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

#include "application_configuration.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_types.hpp"

namespace simcore::telemetry {
class ITelemetryReader;
}
namespace simcore::value_smoothing {
class Service;
}

namespace simcore::dashboard::frame {

using ValueReadCallback = telemetry::TelemetryRead (*)(void* context);

struct ModifierReader {
  ValueReadCallback read{};
  void* context{};
};

using ModifierReaders =
    std::array<ModifierReader, configuration::kValueModifierTypeNames.size()>;

[[nodiscard]] inline ModifierReader modifier_reader(
    const ModifierReaders& readers,
    const configuration::ValueModifierType type) {
  const auto index = static_cast<std::size_t>(type);
  return index < readers.size() ? readers[index] : ModifierReader{};
}

struct SourceContext {
  const telemetry::ITelemetryReader* telemetry{};
  telemetry::Handle handle{};
};

[[nodiscard]] inline bool watches_value(const configuration::WidgetFrame& frame) {
  return frame.condition_count > 0 || frame.color_ramp.stop_count >= 2;
}

[[nodiscard]] inline bool binds_caption(
    const configuration::WidgetFrame& frame) {
  return !configuration::value_binding_view(frame.title.source.binding).empty();
}

[[nodiscard]] bool bind_source(
    std::string_view name, std::uint8_t modifier_count,
    std::span<const configuration::ValueModifier> modifiers,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReaders& modifier_readers,
    value_smoothing::Service* smoothing, SourceContext& context,
    ValueReadCallback& read, void*& read_context, bool& fast_updates);

struct BoundSource {
  ValueReadCallback read{};
  void* read_context{};
  bool fast_updates{};
};

struct ValueBinding {
  ValueReadCallback read{};
  void* read_context{};
  bool fast_updates{};
  ValueReadCallback condition_read{};
  void* condition_context{};
  ValueReadCallback caption_read{};
  void* caption_context{};
};

[[nodiscard]] bool bind_frame(const configuration::WidgetFrame& frame,
                              const telemetry::ITelemetryRegistry& registry,
                              const telemetry::ITelemetryReader& telemetry,
                              const ModifierReaders& modifier_readers,
                              SourceContext& condition_context,
                              SourceContext& caption_context,
                              ValueBinding& binding);

template <typename WidgetConfig, std::size_t Capacity>
class ValueBinder final {
 public:
  [[nodiscard]] bool bind(const std::span<const WidgetConfig> configurations,
                          const telemetry::ITelemetryRegistry& registry,
                          const telemetry::ITelemetryReader& telemetry,
                          const ModifierReaders& modifier_readers,
                          value_smoothing::Service* const smoothing = nullptr) {
    count_ = 0;
    if (configurations.size() > bindings_.size()) {
      return false;
    }
    for (const WidgetConfig& configuration : configurations) {
      ValueBinding binding{};
      if (!bind_source(
              configuration::value_binding_view(configuration.source.binding),
              configuration.source.modifier_count,
              configuration.source.modifiers, registry, telemetry,
              modifier_readers, smoothing, value_contexts_[count_],
              binding.read, binding.read_context, binding.fast_updates)) {
        count_ = 0;
        return false;
      }
      if (!bind_frame(configuration.frame, registry, telemetry,
                      modifier_readers, condition_contexts_[count_],
                      caption_contexts_[count_], binding)) {
        count_ = 0;
        return false;
      }
      bindings_[count_] = binding;
      ++count_;
    }
    return true;
  }

  [[nodiscard]] std::span<const ValueBinding> bindings() const {
    return {bindings_.data(), count_};
  }

 private:
  std::array<SourceContext, Capacity> value_contexts_{};
  std::array<SourceContext, Capacity> condition_contexts_{};
  std::array<SourceContext, Capacity> caption_contexts_{};
  std::array<ValueBinding, Capacity> bindings_{};
  std::size_t count_{};
};

template <typename WidgetConfig, std::size_t Capacity>
class ConditionBinder final {
 public:
  [[nodiscard]] bool bind(const std::span<const WidgetConfig> configurations,
                          const telemetry::ITelemetryRegistry& registry,
                          const telemetry::ITelemetryReader& telemetry,
                          const ModifierReaders& modifier_readers) {
    count_ = 0;
    if (configurations.size() > bindings_.size()) {
      return false;
    }
    for (const WidgetConfig& configuration : configurations) {
      ValueBinding binding{};
      if (!bind_frame(configuration.frame, registry, telemetry,
                      modifier_readers, condition_contexts_[count_],
                      caption_contexts_[count_], binding)) {
        count_ = 0;
        return false;
      }
      bindings_[count_] = binding;
      ++count_;
    }
    return true;
  }

  [[nodiscard]] std::span<const ValueBinding> bindings() const {
    return {bindings_.data(), count_};
  }

 private:
  std::array<SourceContext, Capacity> condition_contexts_{};
  std::array<SourceContext, Capacity> caption_contexts_{};
  std::array<ValueBinding, Capacity> bindings_{};
  std::size_t count_{};
};

}
