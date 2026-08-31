#pragma once

namespace simcore::log {

void info(const char* tag, const char* format, ...) __attribute__((format(printf, 2, 3)));
void warn(const char* tag, const char* format, ...) __attribute__((format(printf, 2, 3)));
void error(const char* tag, const char* format, ...) __attribute__((format(printf, 2, 3)));

}
