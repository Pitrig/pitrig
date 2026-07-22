#include "esp_log.h"

namespace {

constexpr char kTag[] = "simcore";

}  // namespace

extern "C" void app_main() {
  ESP_LOGI(kTag, "SimCore starting");
}
