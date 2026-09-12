#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "asset_control.hpp"

namespace pitrig::asset_control {

template <typename Service>
[[nodiscard]] Service& service_cast(void* const service) {
  return *static_cast<Service*>(service);
}

template <typename Error>
[[nodiscard]] const char* error_word(const Error error) {
  return error == Error::none ? nullptr : update_error_name(error);
}

template <typename Service, int (*WriteInfoBody)(const Service&, char*, std::size_t)>
[[nodiscard]] Operations operations_for(Service& service) {
  return {
      .service = &service,
      .begin_update =
          [](void* const target, const std::size_t package_size) {
            return error_word(service_cast<Service>(target).begin_update(package_size));
          },
      .write_update =
          [](void* const target, const std::span<const std::uint8_t> bytes) {
            return error_word(service_cast<Service>(target).write_update(bytes));
          },
      .commit_update =
          [](void* const target) {
            return error_word(service_cast<Service>(target).commit_update());
          },
      .clear = [](void* const target) { return error_word(service_cast<Service>(target).clear()); },
      .cancel_update = [](void* const target) { service_cast<Service>(target).cancel_update(); },
      .write_info_body =
          [](void* const target, char* const out, const std::size_t size) {
            return WriteInfoBody(service_cast<Service>(target), out, size);
          },
  };
}

}
