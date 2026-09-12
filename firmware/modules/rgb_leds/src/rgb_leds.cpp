#include "rgb_leds.hpp"

#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "led_device.hpp"
#include "led_paint.hpp"
#include "logger.hpp"
#include "pitrig_features.hpp"
#include "rgb_frames.hpp"

namespace pitrig::rgb_leds {
namespace {

constexpr std::size_t kStopWaitTicks = 200;
constexpr std::uint32_t kStopPollMs = 5;

[[nodiscard]] void* allocate(const std::size_t bytes) {
  void* memory = heap_caps_calloc(bytes, 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (memory == nullptr) {
    memory = heap_caps_calloc(bytes, 1, MALLOC_CAP_8BIT);
  }
  return memory;
}

[[nodiscard]] const configuration::LedSpriteConfiguration* sprite_of(
    const configuration::HardwareDeviceConfiguration& device, const std::string_view id) {
  for (std::uint8_t index = 0; index < device.sprite_count; ++index) {
    if (configuration::text_view(device.sprites[index].id) == id) {
      return &device.sprites[index];
    }
  }
  return nullptr;
}

}

RgbLeds::~RgbLeds() { stop(); }

bool RgbLeds::reserve_frames(const configuration::ApplicationConfiguration& configuration) {
  release_frames();
  for (std::size_t index = 0; index < configuration.device_count; ++index) {
    const configuration::HardwareDeviceConfiguration& device = configuration.hardware[index];

    const std::size_t lamps = lamps_of(device);
    working_bytes_ += led::working_bytes(lamps);
    wire_bytes_ += led::wire_bytes(lamps, chip_of(device.chip));
  }
  if (working_bytes_ == 0 || wire_bytes_ == 0) {
    release_frames();
    return false;
  }
  const std::size_t layers = kMaximumOutputs * kMaximumEffects;
  bindings_ = static_cast<EffectBinding*>(allocate(layers * sizeof(EffectBinding)));
  states_ = static_cast<EffectState*>(allocate(layers * sizeof(EffectState)));
  device_store_ = static_cast<configuration::HardwareDeviceConfiguration*>(
      allocate(configuration.device_count * sizeof(configuration::HardwareDeviceConfiguration)));
  working_ = static_cast<std::uint8_t*>(allocate(working_bytes_));
  shadow_ = static_cast<std::uint8_t*>(allocate(working_bytes_));
  wire_ = static_cast<std::uint8_t*>(
      heap_caps_calloc(wire_bytes_, 1, MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA));
  if (working_ == nullptr || shadow_ == nullptr || wire_ == nullptr || bindings_ == nullptr ||
      states_ == nullptr || device_store_ == nullptr) {
    log::error(kLedTag, "No memory for %u lamp frames", static_cast<unsigned>(wire_bytes_));
    release_frames();
    return false;
  }
  return true;
}

void RgbLeds::release_frames() {
  heap_caps_free(working_);
  heap_caps_free(shadow_);
  heap_caps_free(wire_);
  heap_caps_free(bindings_);
  heap_caps_free(states_);
  heap_caps_free(device_store_);
  working_ = nullptr;
  shadow_ = nullptr;
  wire_ = nullptr;
  bindings_ = nullptr;
  states_ = nullptr;
  device_store_ = nullptr;
  working_bytes_ = 0;
  wire_bytes_ = 0;
}

bool RgbLeds::start(events::EventBus&, const telemetry::ITelemetryRegistry& registry,
                    const telemetry::ITelemetryReader& reader, const led::driver::Driver& driver,
                    const configuration::ApplicationConfiguration& configuration) {
  if (running_.load()) {
    return true;
  }
  if (task_ != nullptr) {
    if (!finished_.load()) {
      log::error(kLedTag, "Previous frame task has not finished yet");
      return false;
    }
    task_ = nullptr;
    teardown();
  }
  output_count_ = 0;
  std::size_t working_used = 0;
  std::size_t wire_used = 0;
  if (!reserve_frames(configuration)) {
    return false;
  }

  for (std::size_t index = 0; index < configuration.device_count; ++index) {
    device_store_[index] = configuration.hardware[index];
    const configuration::HardwareDeviceConfiguration& device = device_store_[index];

    const led::Matrix geometry = geometry_of(device);
    const std::size_t lamps = lamps_of(device);
    const led::driver::Chip chip = chip_of(device.chip);
    const std::size_t working_size = led::working_bytes(lamps);
    const std::size_t wire_size = led::wire_bytes(lamps, chip);
    const led::driver::Configuration config{.pin = device.pin, .chip = chip, .lamps = lamps};
    const std::size_t slot = output_count_;
    if (lamps == 0 || working_used + working_size > working_bytes_ ||
        wire_used + wire_size > wire_bytes_ ||
        !outputs_[slot].open(driver, config, {working_ + working_used, working_size},
                             {wire_ + wire_used, wire_size},
                             {shadow_ + working_used, working_size})) {
      log::error(kLedTag, "Output on pin %d did not come up", device.pin);
      for (std::size_t opened = 0; opened < output_count_; ++opened) {
        outputs_[opened].close();
      }
      output_count_ = 0;
      release_frames();
      return false;
    }
    working_used += working_size;
    wire_used += wire_size;
    devices_[slot] = &device;
    geometry_[slot] = geometry;
    pushed_[slot] = false;
    in_flight_[slot] = false;
    for (std::uint8_t effect = 0; effect < device.effect_count; ++effect) {
      const configuration::LedEffect& layer = device.effects[effect];
      states_[slot * kMaximumEffects + effect] = {};
      bindings_[slot * kMaximumEffects + effect] = {
          .value = registry.resolve(configuration::text_view(layer.source.binding)),
          .condition = registry.resolve(configuration::text_view(layer.condition_source.binding)),
          .sprite = layer.type == configuration::LedEffectType::sprite
                        ? sprite_of(device, configuration::text_view(layer.sprite))
                        : nullptr,
          .area = area_of(geometry, layer),
      };
    }
    ++output_count_;
  }

  if (output_count_ == 0) {
    release_frames();
    return false;
  }

  reader_ = &reader;
  running_.store(true);
  finished_.store(false);
  TaskHandle_t task = nullptr;
  if (xTaskCreatePinnedToCore(&RgbLeds::task_entry, "rgb_leds", kTaskStackBytes, this,
                              kTaskPriority, &task, PITRIG_COMMUNICATION_CORE) != pdPASS) {
    task = nullptr;
  }
  task_ = task;
  if (task_ == nullptr) {
    log::error(kLedTag, "Frame task did not start");
    running_.store(false);
    finished_.store(true);
    stop();
    return false;
  }
  log::info(kLedTag, "%u output(s) lit", static_cast<unsigned>(output_count_));
  return true;
}

void RgbLeds::stop() {
  running_.store(false);
  if (task_ != nullptr) {
    for (std::size_t wait = 0; wait < kStopWaitTicks && !finished_.load(); ++wait) {
      vTaskDelay(pdMS_TO_TICKS(kStopPollMs));
    }
    if (!finished_.load()) {
      log::error(kLedTag, "Frame task did not finish; leaving its outputs open");
      return;
    }
    task_ = nullptr;
  }
  teardown();
}

void RgbLeds::teardown() {
  for (std::size_t index = 0; index < output_count_; ++index) {
    outputs_[index].close();
  }
  output_count_ = 0;
  release_frames();
  reader_ = nullptr;
}

}
