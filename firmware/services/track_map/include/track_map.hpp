#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <span>
#include <string_view>

#include "event_bus.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_state.hpp"
#include "telemetry_types.hpp"

namespace pitrig::track_map {

inline constexpr std::size_t kMaximumTrackPoints = 1023;
inline constexpr std::size_t kMaximumPitPoints = 255;
inline constexpr std::size_t kMaximumSectorStarts = 15;
inline constexpr std::size_t kCarFields = 4;
inline constexpr std::size_t kCarsPerField = 21;
inline constexpr std::size_t kMaximumCars = kCarFields * kCarsPerField;
inline constexpr std::size_t kMaximumPieces = 63;
inline constexpr std::size_t kPieceDigits = 59;
inline constexpr std::int32_t kGridSize = 4096;
inline constexpr std::uint32_t kLapUnits = 4096;

inline constexpr std::string_view kOutlineField = "track.map.outline";
inline constexpr std::array<std::string_view, kCarFields> kCarFieldNames{
    "track.map.cars_1", "track.map.cars_2", "track.map.cars_3", "track.map.cars_4"};

struct Point {
  std::int16_t x{};
  std::int16_t y{};
};

struct Outline {
  std::array<Point, kMaximumTrackPoints> track{};
  std::array<Point, kMaximumPitPoints> pit{};
  std::array<std::uint16_t, kMaximumSectorStarts> sector_starts{};
  std::uint16_t track_count{};
  std::uint16_t pit_count{};
  std::uint16_t pit_from{};
  std::uint16_t pit_to{};
  std::uint16_t finish{};
  std::uint8_t sector_count{};
};

enum class CarRole : std::uint8_t {
  player = 1,
  car,
  ahead,
  behind,
  lapping,
  lapped,
};

struct Car {
  std::uint16_t fraction{};
  CarRole role{CarRole::car};
  std::uint8_t car_class{};
  bool pit{};
};

struct Assembly {
  std::array<char, kMaximumPieces * kPieceDigits> digits{};
  std::uint64_t present{};
  std::uint16_t id{};
  std::uint8_t count{};
  std::uint8_t last_length{};
};

struct Storage {
  Assembly assembly{};
  Outline decoded{};
  Outline published{};
};

class Service final {
 public:
  static constexpr std::size_t kStorageBytes = sizeof(Storage) + alignof(Storage);

  Service(const telemetry::ITelemetryRegistry& registry,
          const telemetry::ITelemetryReader& telemetry, events::EventBus& event_bus);
  ~Service();

  Service(const Service&) = delete;
  Service& operator=(const Service&) = delete;

  [[nodiscard]] bool attach(std::span<std::uint8_t> storage);
  [[nodiscard]] bool start();
  void stop();
  [[nodiscard]] bool active() const { return subscription_.valid; }

  [[nodiscard]] std::uint32_t generation() const {
    return generation_.load(std::memory_order_acquire);
  }
  [[nodiscard]] std::uint32_t copy_outline(Outline& destination) const;
  [[nodiscard]] std::size_t read_cars(std::span<Car> destination) const;

 private:
  static void on_telemetry_updated(const events::Event& event, void* context);

  void accept(std::string_view piece);
  void publish(std::size_t body_digits);

  const telemetry::ITelemetryReader& telemetry_;
  events::EventBus& event_bus_;
  telemetry::Handle outline_handle_{};
  std::array<telemetry::Handle, kCarFields> car_handles_{};
  events::Subscription subscription_{};
  Storage* storage_{};
  mutable std::mutex mutex_;
  std::atomic<std::uint32_t> generation_{0};
};

}
