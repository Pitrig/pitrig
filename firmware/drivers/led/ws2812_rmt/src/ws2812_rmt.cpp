#include "ws2812_rmt.hpp"

#include <array>
#include <cstdint>

#include "driver/rmt_tx.h"
#include "esp_err.h"
#include "esp_log.h"
#include "soc/soc_caps.h"
#include "ws2812_encoder.hpp"

namespace pitrig::led::drivers::ws2812_rmt {
namespace {

constexpr char kTag[] = "ws2812";
constexpr std::uint32_t kResolutionHz = 10'000'000;
constexpr std::size_t kMemoryBlockSymbols = SOC_RMT_MEM_WORDS_PER_CHANNEL;
constexpr std::size_t kDmaBlockSymbols = 512;
constexpr std::size_t kDmaLampThreshold = 32;
constexpr std::size_t kMaximumChannels = 4;

struct Attempt {
  std::size_t symbols{};
  bool with_dma{};
};

constexpr std::array<Attempt, 2> kAttempts{{
    {kDmaBlockSymbols, true},
    {kMemoryBlockSymbols, false},
}};

struct Channel {
  rmt_channel_handle_t channel{};
  ChainEncoder encoder{};
  bool open{};
};

std::array<Channel, kMaximumChannels> channels{};

[[nodiscard]] Channel* find(const driver::Handle handle) {
  if (!handle.valid() || handle.index >= channels.size() ||
      !channels[handle.index].open) {
    return nullptr;
  }
  return &channels[handle.index];
}

void release(Channel& slot) {
  if (slot.channel != nullptr) {
    (void)rmt_disable(slot.channel);
    (void)rmt_del_channel(slot.channel);
    slot.channel = nullptr;
  }
  encoder_close(slot.encoder);
  slot.open = false;
}

driver::Handle open(const driver::Configuration& configuration) {
  if (configuration.pin < 0 || configuration.lamps == 0) {
    return {};
  }
  std::size_t index = 0;
  while (index < channels.size() && channels[index].open) {
    ++index;
  }
  if (index == channels.size()) {
    ESP_LOGE(kTag, "No transmit channel left for pin %d", configuration.pin);
    return {};
  }
  Channel& slot = channels[index];
  const std::size_t first = configuration.lamps >= kDmaLampThreshold ? 0 : 1;
  const Attempt* taken = nullptr;
  for (std::size_t attempt = first; attempt < kAttempts.size(); ++attempt) {
    const rmt_tx_channel_config_t config{
        .gpio_num = static_cast<gpio_num_t>(configuration.pin),
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = kResolutionHz,
        .mem_block_symbols = kAttempts[attempt].symbols,
        .trans_queue_depth = 1,
        .intr_priority = 3,
        .flags = {.invert_out = 0,
                  .with_dma = kAttempts[attempt].with_dma ? 1U : 0U,
                  .allow_pd = 0,
                  .init_level = 0},
    };
    if (rmt_new_tx_channel(&config, &slot.channel) == ESP_OK) {
      taken = &kAttempts[attempt];
      break;
    }
    slot.channel = nullptr;
  }
  if (taken == nullptr) {
    ESP_LOGE(kTag, "Pin %d could not take a transmit channel",
             configuration.pin);
    return {};
  }
  if (encoder_open(slot.encoder, kResolutionHz) != ESP_OK ||
      rmt_enable(slot.channel) != ESP_OK) {
    ESP_LOGE(kTag, "Pin %d could not start transmitting", configuration.pin);
    release(slot);
    return {};
  }
  slot.open = true;
  ESP_LOGI(kTag, "Pin %d clocks %u lamps from %u symbols%s", configuration.pin,
           static_cast<unsigned>(configuration.lamps),
           static_cast<unsigned>(taken->symbols),
           taken->with_dma ? " over dma" : "");
  return {.index = static_cast<std::uint8_t>(index)};
}

bool transmit(const driver::Handle handle,
              const std::span<const std::uint8_t> bytes) {
  Channel* const slot = find(handle);
  if (slot == nullptr || bytes.empty()) {
    return false;
  }
  const rmt_transmit_config_t config{
      .loop_count = 0, .flags = {.eot_level = 0, .queue_nonblocking = 1}};
  return rmt_transmit(slot->channel, &slot->encoder.base, bytes.data(),
                      bytes.size(), &config) == ESP_OK;
}

bool wait(const driver::Handle handle, const std::uint32_t timeout_ms) {
  Channel* const slot = find(handle);
  return slot != nullptr &&
         rmt_tx_wait_all_done(slot->channel,
                              static_cast<int>(timeout_ms)) == ESP_OK;
}

void close(const driver::Handle handle) {
  Channel* const slot = find(handle);
  if (slot != nullptr) {
    (void)rmt_tx_wait_all_done(slot->channel, 100);
    release(*slot);
  }
}

constexpr driver::Driver kDriver{
    .name = "ws2812_rmt",
    .open = &open,
    .transmit = &transmit,
    .wait = &wait,
    .close = &close,
};

}

const driver::Driver& get() { return kDriver; }

}
