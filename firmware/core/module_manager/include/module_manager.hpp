#pragma once

#include <array>
#include <cstddef>

namespace pitrig::modules {

using StartCallback = bool (*)(void* context);
using StopCallback = void (*)(void* context);

struct Descriptor {
  bool enabled{};
  StartCallback start{};
  StopCallback stop{};
  void* context{};
};

class Manager final {
 public:
  static constexpr std::size_t kMaximumModules = 16;

  Manager() = default;
  ~Manager();

  Manager(const Manager&) = delete;
  Manager& operator=(const Manager&) = delete;

  [[nodiscard]] bool add(const Descriptor& descriptor);
  [[nodiscard]] bool start_all();
  [[nodiscard]] bool restart_at(std::size_t index, bool enabled);
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

}
