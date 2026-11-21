#include "track_map.hpp"

#include <algorithm>
#include <cstddef>
#include <memory>

#include "outline_decoder.hpp"
#include "telemetry_events.hpp"
#include "track_map_digits.hpp"

namespace pitrig::track_map {
namespace {

constexpr std::size_t kPieceHeaderDigits = 4;
constexpr std::size_t kCarDigits = 3;
constexpr std::uint32_t kPitFlag = 1;
constexpr int kClassBits = 3;
constexpr int kClassMask = 7;
constexpr int kMaximumClass = 4;

[[nodiscard]] std::uint64_t mask_of(const std::size_t count) {
  return count >= 64 ? ~std::uint64_t{} : (std::uint64_t{1} << count) - 1;
}

[[nodiscard]] bool decode_car(const char* const text, Car& car) {
  const int high = digits::value(text[0]);
  const int low = digits::value(text[1]);
  const int kind = digits::value(text[2]);
  if (high < 0 || low < 0 || kind < 0) {
    return false;
  }
  const int role = kind >> kClassBits;
  if (role < static_cast<int>(CarRole::player) || role > static_cast<int>(CarRole::lapped)) {
    return false;
  }
  const auto packed = static_cast<std::uint32_t>((high << 6) | low);
  car.fraction = static_cast<std::uint16_t>((packed >> 1) * 2);
  car.pit = (packed & kPitFlag) != 0;
  car.role = static_cast<CarRole>(role);
  car.car_class = static_cast<std::uint8_t>(std::min(kind & kClassMask, kMaximumClass));
  return true;
}

}

Service::Service(const telemetry::ITelemetryRegistry& registry,
                 const telemetry::ITelemetryReader& telemetry, events::EventBus& event_bus)
    : telemetry_(telemetry),
      event_bus_(event_bus),
      outline_handle_(registry.resolve(kOutlineField)) {
  for (std::size_t index = 0; index < kCarFields; ++index) {
    car_handles_[index] = registry.resolve(kCarFieldNames[index]);
  }
}

Service::~Service() { stop(); }

bool Service::attach(const std::span<std::uint8_t> storage) {
  if (storage_ != nullptr) {
    return true;
  }
  void* aligned = storage.data();
  std::size_t space = storage.size();
  if (std::align(alignof(Storage), sizeof(Storage), aligned, space) == nullptr) {
    return false;
  }
  storage_ = std::construct_at(static_cast<Storage*>(aligned));
  return true;
}

bool Service::start() {
  if (storage_ == nullptr || !outline_handle_.valid()) {
    return false;
  }
  if (!subscription_.valid) {
    subscription_ =
        event_bus_.subscribe(telemetry::kTelemetryUpdatedEvent, &on_telemetry_updated, this);
  }
  return subscription_.valid;
}

void Service::stop() {
  if (!subscription_.valid) {
    return;
  }
  event_bus_.unsubscribe(subscription_);
  subscription_ = {};
}

void Service::on_telemetry_updated(const events::Event& event, void* const context) {
  auto& service = *static_cast<Service*>(context);
  const auto* const update = static_cast<const telemetry::TelemetryUpdated*>(event.payload);
  if (update == nullptr || !(update->handle == service.outline_handle_)) {
    return;
  }
  const telemetry::TelemetryRead read = service.telemetry_.read(service.outline_handle_);
  if (!read.available) {
    return;
  }
  const telemetry::TextValue& text = read.value.source_text;
  const auto end = std::find(text.begin(), text.end(), '\0');
  service.accept({text.data(), static_cast<std::size_t>(end - text.begin())});
}

void Service::accept(const std::string_view piece) {
  if (piece.size() <= kPieceHeaderDigits) {
    return;
  }
  const int index = digits::value(piece[0]);
  const int count = digits::value(piece[1]);
  const int id_high = digits::value(piece[2]);
  const int id_low = digits::value(piece[3]);
  if (index < 0 || count < 1 || id_high < 0 || id_low < 0 || index >= count ||
      count > static_cast<int>(kMaximumPieces)) {
    return;
  }
  const std::string_view payload = piece.substr(kPieceHeaderDigits);
  const bool last = index == count - 1;
  if (payload.size() > kPieceDigits || (!last && payload.size() != kPieceDigits)) {
    return;
  }
  Assembly& assembly = storage_->assembly;
  const auto id = static_cast<std::uint16_t>((id_high << 6) | id_low);
  if (assembly.id != id || assembly.count != count) {
    assembly.id = id;
    assembly.count = static_cast<std::uint8_t>(count);
    assembly.present = 0;
  }
  const std::uint64_t bit = std::uint64_t{1} << index;
  if ((assembly.present & bit) != 0) {
    return;
  }
  std::copy(payload.begin(), payload.end(),
            assembly.digits.begin() + static_cast<std::ptrdiff_t>(index * kPieceDigits));
  if (last) {
    assembly.last_length = static_cast<std::uint8_t>(payload.size());
  }
  assembly.present |= bit;
  if (assembly.present == mask_of(assembly.count)) {
    publish((assembly.count - 1U) * kPieceDigits + assembly.last_length);
  }
}

void Service::publish(const std::size_t body_digits) {
  Storage& storage = *storage_;
  if (!decode_outline({storage.assembly.digits.data(), body_digits}, storage.decoded)) {
    storage.assembly.present = 0;
    return;
  }
  const std::lock_guard lock{mutex_};
  storage.published = storage.decoded;
  generation_.fetch_add(1, std::memory_order_release);
}

std::uint32_t Service::copy_outline(Outline& destination) const {
  if (storage_ == nullptr) {
    return 0;
  }
  const std::lock_guard lock{mutex_};
  destination = storage_->published;
  return generation_.load(std::memory_order_relaxed);
}

std::size_t Service::read_cars(const std::span<Car> destination) const {
  std::size_t count = 0;
  for (const telemetry::Handle handle : car_handles_) {
    if (!handle.valid()) {
      continue;
    }
    const telemetry::TelemetryRead read = telemetry_.read(handle);
    if (!read.available) {
      continue;
    }
    const telemetry::TextValue& text = read.value.source_text;
    for (std::size_t offset = 0; offset + kCarDigits < text.size() && count < destination.size();
         offset += kCarDigits) {
      if (text[offset] == '\0' || text[offset + 1] == '\0' || text[offset + 2] == '\0') {
        break;
      }
      Car car{};
      if (decode_car(&text[offset], car)) {
        destination[count++] = car;
      }
    }
  }
  return count;
}

}
