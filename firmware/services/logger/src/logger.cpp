#include "logger.hpp"

#include <array>
#include <cstdarg>
#include <cstddef>
#include <cstring>

#include "esp_log.h"
#include "simcore_features.hpp"

namespace simcore::log {
namespace {

#ifndef SIMCORE_LOG_MODE_FULL
inline constexpr std::size_t kTerminatedFormatCapacity = 96;
#endif

void write(const esp_log_level_t level, const char* tag, const char* format, va_list args) {
#ifdef SIMCORE_LOG_MODE_FULL
  esp_log_va(ESP_LOG_CONFIG_INIT(level | ESP_LOG_CONFIGS_DEFAULT), tag, format, args);
#else
  const std::size_t length = std::strlen(format);
  if (length + 2U > kTerminatedFormatCapacity ||
      (length > 0U && format[length - 1U] == '\n')) {
    esp_log_writev(level, tag, format, args);
    return;
  }
  std::array<char, kTerminatedFormatCapacity> terminated{};
  std::memcpy(terminated.data(), format, length);
  terminated[length] = '\n';
  esp_log_writev(level, tag, terminated.data(), args);
#endif
}

}

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

}
