#include "simhub_protocol.hpp"

#include <algorithm>
#include <charconv>
#include <cstdint>
#include <system_error>

#include "number_transform.hpp"

namespace simcore::protocols {
namespace {

template <typename Value>
[[nodiscard]] bool parse_integer(const std::span<const char> text,
                                 Value& value) {
  if (text.empty()) {
    return false;
  }
  const auto result =
      std::from_chars(text.data(), text.data() + text.size(), value);
  return result.ec == std::errc{} &&
         result.ptr == text.data() + text.size();
}

[[nodiscard]] bool parse_float(const std::span<const char> text,
                               float& value) {
  return transformers::number_transform::parse({text.data(), text.size()},
                                               value);
}

[[nodiscard]] bool parse_boolean(const std::span<const char> text,
                                 bool& value) {
  const std::string_view source{text.data(), text.size()};
  if (source == "1" || source == "true" || source == "True" ||
      source == "TRUE") {
    value = true;
    return true;
  }
  if (source == "0" || source == "false" || source == "False" ||
      source == "FALSE") {
    value = false;
    return true;
  }
  return false;
}

[[nodiscard]] std::uint16_t identifier_key(
    const std::span<const char> identifier) {
  if (identifier.empty() || identifier.size() > 2) {
    return 0;
  }
  const auto first = static_cast<std::uint8_t>(identifier[0]);
  const auto second = identifier.size() == 2
                          ? static_cast<std::uint8_t>(identifier[1])
                          : std::uint8_t{};
  return static_cast<std::uint16_t>(
      (static_cast<std::uint16_t>(first) << 8U) | second);
}

}

SimHubProtocol::SimHubProtocol(
    const telemetry::ITelemetryRegistry& registry) {
  initialized_ = true;
  for (std::size_t index = 0; index < handles_.size(); ++index) {
    handles_[index] =
        registry.resolve(simhub_catalog::kBindings[index].canonical_name);
    if (!handles_[index].valid()) {
      initialized_ = false;
      break;
    }
  }
}

bool SimHubProtocol::initialized() const {
  return initialized_;
}

telemetry::Handle SimHubProtocol::resolve_identifier(
    const std::span<const char> identifier) const {
  const std::uint16_t key = identifier_key(identifier);
  const auto entry = std::lower_bound(
      simhub_catalog::kLookup.begin(), simhub_catalog::kLookup.end(), key,
      [](const simhub_catalog::LookupEntry candidate,
         const std::uint16_t expected) { return candidate.key < expected; });
  if (entry == simhub_catalog::kLookup.end() || entry->key != key ||
      entry->binding_index >= handles_.size()) {
    return {};
  }
  return handles_[entry->binding_index];
}

void SimHubProtocol::consume_line(const std::span<const std::uint8_t> line,
                                  const telemetry::UpdateHandler handler,
                                  void* const context) {
  if (!initialized_ || handler == nullptr || line.size() < 2 ||
      line.size() > telemetry::kMaximumTelemetryLineLength) {
    return;
  }
  const std::span<const char> text(
      reinterpret_cast<const char*>(line.data()), line.size());

  std::size_t separator{};
  if (text[1] == ';') {
    separator = 1;
  } else if (text.size() >= 3 && text[2] == ';') {
    separator = 2;
  } else {
    return;
  }

  telemetry::TelemetryUpdate update{
      .handle = resolve_identifier(text.first(separator)),
  };
  if (!update.handle.valid()) {
    return;
  }

  const std::span<const char> value = text.subspan(separator + 1);
  if (value.empty()) {
    handler(update, context);
    return;
  }
  if (!telemetry::copy_text_value(update.value.source_text, value)) {
    return;
  }

  switch (update.handle.type) {
    case telemetry::ValueType::text:
      break;
    case telemetry::ValueType::uint32:
      if (!parse_integer(value, update.value.typed.uint32_value)) {
        return;
      }
      break;
    case telemetry::ValueType::int32:
      if (!parse_integer(value, update.value.typed.int32_value)) {
        return;
      }
      break;
    case telemetry::ValueType::float32:
      if (!parse_float(value, update.value.typed.float32_value)) {
        return;
      }
      break;
    case telemetry::ValueType::boolean:
      if (!parse_boolean(value, update.value.typed.boolean_value)) {
        return;
      }
      break;
  }

  update.available = true;
  handler(update, context);
}

}
