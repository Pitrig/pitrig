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

// How a widget resolves the telemetry it reads: one canonical name plus its
// modifiers becomes a callback, bound once at composition. The frame's box and
// painter live in widget_frame.hpp; this header is only the value pipeline's
// startup half, shared by every widget type's binder.
namespace simcore::dashboard::frame {

using ValueReadCallback = telemetry::TelemetryRead (*)(void* context);

// A module that replaces a telemetry value behind the pipeline callback.
struct ModifierReader {
  ValueReadCallback read{};
  void* context{};
};

// One reader per ValueModifierType, indexed by the enum value. The composition
// root fills the entry of every module it started and leaves the rest empty, so
// the binding below resolves a modifier by its index and never names a module.
// Adding a modifier type is then an entry there and a value in the schema;
// nothing in this file or in the per-type binders changes.
using ModifierReaders =
    std::array<ModifierReader, configuration::kValueModifierTypeNames.size()>;

// The reader a modifier type resolves to, or an empty one when the type is out
// of range. Empty fails the bind, which is what an authored modifier whose
// module did not start has always done.
[[nodiscard]] inline ModifierReader modifier_reader(
    const ModifierReaders& readers,
    const configuration::ValueModifierType type) {
  const auto index = static_cast<std::size_t>(type);
  return index < readers.size() ? readers[index] : ModifierReader{};
}

// Telemetry read context, owned by the widget type that binds the source. It is
// deliberately not a pointer into the configuration document, so a replacement
// cannot leave a widget reading stale storage.
struct SourceContext {
  const telemetry::ITelemetryReader* telemetry{};
  telemetry::Handle handle{};
};

// Resolves one canonical name plus its modifiers into a read callback. Every
// widget type binds through this, whether the source drives what it draws or
// only what its rules watch.
[[nodiscard]] bool bind_source(
    std::string_view name, std::uint8_t modifier_count,
    std::span<const configuration::ValueModifier> modifiers,
    const telemetry::ITelemetryRegistry& registry,
    const telemetry::ITelemetryReader& telemetry,
    const ModifierReaders& modifier_readers, SourceContext& context,
    ValueReadCallback& read, void*& read_context, bool& fast_updates);

// One resolved source: the callback that reads it and the context it reads
// through. A widget that binds several holds an array of these; one that binds
// a single value spells the same three fields into ValueBinding below, so a
// bar's binding stays one object rather than an array of one.
struct BoundSource {
  ValueReadCallback read{};
  void* read_context{};
  // Set for module modifiers, whose value derives from a free-running clock and
  // therefore carries no telemetry revision to compare against.
  bool fast_updates{};
};

// One widget's resolved sources: the value it draws and the source its rules
// watch. Widgets that draw a single value all bind exactly this pair.
struct ValueBinding {
  ValueReadCallback read{};
  void* read_context{};
  bool fast_updates{};
  ValueReadCallback condition_read{};
  void* condition_context{};
};

// Binds the value source and the condition source of every widget of one type.
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
      if (widget_frame.condition_count > 0 &&
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

// Binds the condition source of every widget of one type. A widget that draws
// no telemetry of its own still needs this, because its rules do.
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
      if (widget_frame.condition_count > 0 &&
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

}  // namespace simcore::dashboard::frame
