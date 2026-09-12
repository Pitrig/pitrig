#pragma once

#include <cstdint>

#include "driver/rmt_encoder.h"
#include "esp_err.h"

namespace pitrig::led::drivers::ws2812_rmt {

struct ChainEncoder {
  rmt_encoder_t base{};
  rmt_encoder_handle_t bytes{};
  rmt_encoder_handle_t copy{};
  rmt_symbol_word_t reset{};
  int state{};
};

[[nodiscard]] esp_err_t encoder_open(ChainEncoder& encoder, std::uint32_t resolution_hz);

void encoder_close(ChainEncoder& encoder);

}
