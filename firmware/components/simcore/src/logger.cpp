#include "simcore/logger.hpp"

#include <cstdarg>

#include "esp_log.h"

namespace simcore::log {
namespace {

void write(const esp_log_level_t level, const char* tag, const char* format, va_list args) {
#ifdef SIMCORE_LOG_MODE_FULL
  esp_log_va(ESP_LOG_CONFIG_INIT(level | ESP_LOG_CONFIGS_DEFAULT), tag, format, args);
#else
  (void)level;
  (void)args;
  ESP_LOGI(tag, "%s", format);
#endif
}

}  // namespace

void info(const char* tag, const char* format, ...) {
  va_list args;
  va_start(args, format);
  write(ESP_LOG_INFO, tag, format, args);
  va_end(args);
}

void warn(const char* tag, const char* format, ...) {
  va_list args;
  va_start(args, format);
  write(ESP_LOG_WARN, tag, format, args);
  va_end(args);
}

void error(const char* tag, const char* format, ...) {
  va_list args;
  va_start(args, format);
  write(ESP_LOG_ERROR, tag, format, args);
  va_end(args);
}

void debug(const char* tag, const char* format, ...) {
  va_list args;
  va_start(args, format);
  write(ESP_LOG_DEBUG, tag, format, args);
  va_end(args);
}

void verbose(const char* tag, const char* format, ...) {
  va_list args;
  va_start(args, format);
  write(ESP_LOG_VERBOSE, tag, format, args);
  va_end(args);
}

}
