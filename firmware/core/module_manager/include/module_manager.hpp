#pragma once

#include <array>
#include <cstddef>

namespace simcore::modules {

using StartCallback = bool (*)(void* context);
using StopCallback = void (*)(void* context);

struct Descriptor {
  bool enabled{};
  StartCallback start{};
  StopCallback stop{};
  void* context{};
};

// Owns bounded module lifecycle state. Module storage and dependencies remain
// in the application composition layer and are supplied through descriptors.
class Manager final {
 public:
  static constexpr std::size_t kMaximumModules = 16;

  Manager() = default;
  ~Manager();

  Manager(const Manager&) = delete;
  Manager& operator=(const Manager&) = delete;

  [[nodiscard]] bool add(const Descriptor& descriptor);
  [[nodiscard]] bool start_all();
  void stop_all();
  void clear();

 private:
  struct Entry {
    Descriptor descriptor{};
    bool started{};
  };

  std::array<Entry, kMaximumModules> entries_{};
  std::size_t count_{};
};

}  // namespace simcore::modules
