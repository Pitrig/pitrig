#include "ws2812_encoder.hpp"

#include <cstdint>

namespace pitrig::led::drivers::ws2812_rmt {
namespace {

constexpr std::uint16_t kZeroHighTicks = 3;
constexpr std::uint16_t kZeroLowTicks = 9;
constexpr std::uint16_t kOneHighTicks = 9;
constexpr std::uint16_t kOneLowTicks = 3;
constexpr std::uint32_t kResetMicroseconds = 300;

[[nodiscard]] ChainEncoder& owner(rmt_encoder_t* const base) {
  return *reinterpret_cast<ChainEncoder*>(base);
}

std::size_t encode(rmt_encoder_t* const base, rmt_channel_handle_t const channel,
                   const void* const payload, const std::size_t size,
                   rmt_encode_state_t* const state) {
  ChainEncoder& encoder = owner(base);
  rmt_encode_state_t session = RMT_ENCODING_RESET;
  std::size_t written = 0;

  if (encoder.state == 0) {
    written += encoder.bytes->encode(encoder.bytes, channel, payload, size, &session);
    if ((session & RMT_ENCODING_COMPLETE) != 0) {
      encoder.state = 1;
    }
    if ((session & RMT_ENCODING_MEM_FULL) != 0) {
      *state = RMT_ENCODING_MEM_FULL;
      return written;
    }
  }
  if (encoder.state == 1) {
    written += encoder.copy->encode(encoder.copy, channel, &encoder.reset, sizeof(encoder.reset),
                                    &session);
    if ((session & RMT_ENCODING_COMPLETE) != 0) {
      encoder.state = 0;
      *state = RMT_ENCODING_COMPLETE;
      return written;
    }
    if ((session & RMT_ENCODING_MEM_FULL) != 0) {
      *state = RMT_ENCODING_MEM_FULL;
      return written;
    }
  }
  *state = RMT_ENCODING_RESET;
  return written;
}

esp_err_t reset_encoder(rmt_encoder_t* const base) {
  ChainEncoder& encoder = owner(base);
  (void)rmt_encoder_reset(encoder.bytes);
  (void)rmt_encoder_reset(encoder.copy);
  encoder.state = 0;
  return ESP_OK;
}

esp_err_t delete_encoder(rmt_encoder_t*) { return ESP_OK; }

}

esp_err_t encoder_open(ChainEncoder& encoder, const std::uint32_t resolution_hz) {
  const rmt_bytes_encoder_config_t bytes{
      .bit0 = {{kZeroHighTicks, 1, kZeroLowTicks, 0}},
      .bit1 = {{kOneHighTicks, 1, kOneLowTicks, 0}},
      .flags = {.msb_first = 1},
  };
  if (const esp_err_t error = rmt_new_bytes_encoder(&bytes, &encoder.bytes); error != ESP_OK) {
    return error;
  }
  const rmt_copy_encoder_config_t copy{};
  if (const esp_err_t error = rmt_new_copy_encoder(&copy, &encoder.copy); error != ESP_OK) {
    encoder_close(encoder);
    return error;
  }
  const auto half = static_cast<std::uint16_t>(resolution_hz / 1'000'000 * kResetMicroseconds / 2);
  encoder.reset = {{half, 0, half, 0}};
  encoder.state = 0;
  encoder.base.encode = &encode;
  encoder.base.reset = &reset_encoder;
  encoder.base.del = &delete_encoder;
  return ESP_OK;
}

void encoder_close(ChainEncoder& encoder) {
  if (encoder.bytes != nullptr) {
    (void)rmt_del_encoder(encoder.bytes);
    encoder.bytes = nullptr;
  }
  if (encoder.copy != nullptr) {
    (void)rmt_del_encoder(encoder.copy);
    encoder.copy = nullptr;
  }
  encoder.state = 0;
}

}
