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

[[nodiscard]] bool bind_source(
    std::string_view name, std::uint8_t modifier_count,
    std::span<const configuration::ValueModifier> modifiers,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReaders& modifier_readers, SourceContext& context,
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
};

template <typename WidgetConfig, std::size_t Capacity>
class ValueBinder final {
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
      if (!bind_source(
              configuration::value_binding_view(configuration.source.binding),
              configuration.source.modifier_count,
              configuration.source.modifiers, registry, telemetry,
              modifier_readers, value_contexts_[count_], binding.read,
              binding.read_context, binding.fast_updates)) {
        count_ = 0;
        return false;
      }
      const configuration::WidgetFrame& widget_frame = configuration.frame;
      bool condition_fast{};
      if (watches_value(widget_frame) &&
          !bind_source(configuration::value_binding_view(
                           widget_frame.condition_source.binding),
                       widget_frame.condition_source.modifier_count,
                       widget_frame.condition_source.modifiers, registry,
                       telemetry, modifier_readers,
                       condition_contexts_[count_], binding.condition_read,
                       binding.condition_context, condition_fast)) {
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
    if (configurations.size() > reads_.size()) {
      return false;
    }
    for (const WidgetConfig& configuration : configurations) {
      ValueReadCallback read{};
      void* read_context{};
      bool fast_updates{};
      const configuration::WidgetFrame& widget_frame = configuration.frame;
      if (watches_value(widget_frame) &&
          !bind_source(configuration::value_binding_view(
                           widget_frame.condition_source.binding),
                       widget_frame.condition_source.modifier_count,
                       widget_frame.condition_source.modifiers, registry,
                       telemetry, modifier_readers, contexts_[count_], read,
                       read_context, fast_updates)) {
        count_ = 0;
        return false;
      }
      reads_[count_] = read;
      read_contexts_[count_] = read_context;
      ++count_;
    }
    return true;
  }

  [[nodiscard]] std::span<const ValueReadCallback> reads() const {
    return {reads_.data(), count_};
  }
  [[nodiscard]] std::span<void* const> contexts() const {
    return {read_contexts_.data(), count_};
  }

 private:
  std::array<SourceContext, Capacity> contexts_{};
  std::array<ValueReadCallback, Capacity> reads_{};
  std::array<void*, Capacity> read_contexts_{};
  std::size_t count_{};
};

}
