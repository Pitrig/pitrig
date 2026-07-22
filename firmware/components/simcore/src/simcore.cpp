#include "simcore/simcore.hpp"

#include "esp_log.h"

namespace simcore {
namespace {

constexpr char kTag[] = "simcore";

}

void run() {
  ESP_LOGI(kTag, "SimCore starting");
}

}
