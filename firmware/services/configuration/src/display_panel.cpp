#include "display_panel.hpp"

#include <array>
#include <cstddef>
#include <mutex>

#include "configuration_service.hpp"

namespace pitrig::configuration {
namespace {

constexpr std::uint8_t kRecordVersion = 1;
constexpr std::uint8_t kFixed = 0;
constexpr std::uint8_t kChecking = 1;

struct Record {
  std::uint8_t mode{};
  std::uint8_t panel{};
  std::uint8_t tries{};
};

enum class RecordRead : std::uint8_t {
  absent,
  valid,
  unreadable,
};

using RecordBytes = std::array<std::uint8_t, 4>;

[[nodiscard]] std::uint8_t newest(const std::uint8_t panel_count) {
  return static_cast<std::uint8_t>(panel_count - 1U);
}

[[nodiscard]] RecordRead read_record(IConfigurationStorage& storage,
                                     const std::uint8_t panel_count, Record& record) {
  RecordBytes bytes{};
  std::size_t size{};
  const StorageRead read = storage.read_board(bytes, size);
  if (read == StorageRead::absent) {
    return RecordRead::absent;
  }
  if (read != StorageRead::loaded || size != bytes.size() || bytes[0] != kRecordVersion ||
      bytes[1] > kChecking || bytes[2] >= panel_count) {
    return RecordRead::unreadable;
  }
  record = {.mode = bytes[1], .panel = bytes[2], .tries = bytes[3]};
  return RecordRead::valid;
}

bool write_record(IConfigurationStorage& storage, const Record& record) {
  const RecordBytes bytes{kRecordVersion, record.mode, record.panel, record.tries};
  return storage.write_board(bytes);
}

[[nodiscard]] bool check_running(const Record& record) {
  return record.mode == kChecking && record.tries < kPanelCheckTries;
}

}

PanelChoice begin_panel(IConfigurationStorage& storage, const std::uint8_t panel_count,
                        const bool continues_check) {
  if (panel_count <= 1) {
    return {};
  }
  Record record{};
  const RecordRead read = read_record(storage, panel_count, record);
  if (read == RecordRead::unreadable) {
    return {};
  }
  if (read == RecordRead::absent) {
    record = storage.holds_documents() ? Record{.mode = kFixed}
                                       : Record{.mode = kChecking, .panel = newest(panel_count)};
    (void)write_record(storage, record);
  } else if (record.mode == kChecking && !continues_check) {
    record.panel = newest(panel_count);
    record.tries = 0;
    (void)write_record(storage, record);
  }
  return {.panel = record.panel, .check = check_running(record)};
}

namespace display_panel {

std::optional<PanelChoice> stored(IConfigurationStorage& storage, const std::uint8_t panel_count) {
  Record record{};
  if (read_record(storage, panel_count, record) != RecordRead::valid) {
    return std::nullopt;
  }
  return PanelChoice{.panel = record.panel, .check = check_running(record)};
}

bool store(IConfigurationStorage& storage, const PanelChoice choice,
           const std::uint8_t panel_count) {
  if (choice.check) {
    return write_record(storage, Record{.mode = kChecking, .panel = newest(panel_count)});
  }
  return choice.panel < panel_count &&
         write_record(storage, Record{.mode = kFixed, .panel = choice.panel});
}

bool confirm(IConfigurationStorage& storage, const std::uint8_t panel,
             const std::uint8_t panel_count) {
  Record record{};
  if (read_record(storage, panel_count, record) != RecordRead::valid ||
      !check_running(record) || record.panel != panel) {
    return false;
  }
  return write_record(storage, Record{.mode = kFixed, .panel = panel});
}

bool try_next(IConfigurationStorage& storage, const std::uint8_t panel_count) {
  Record record{};
  if (read_record(storage, panel_count, record) != RecordRead::valid || !check_running(record)) {
    return false;
  }
  record.tries = static_cast<std::uint8_t>(record.tries + 1U);
  record.panel = record.tries >= kPanelCheckTries || record.panel == 0
                     ? newest(panel_count)
                     : static_cast<std::uint8_t>(record.panel - 1U);
  return write_record(storage, record);
}

}

std::optional<PanelChoice> ConfigurationService::panel() const {
  const std::lock_guard<std::mutex> guard(panel_lock_);
  if (storage_ == nullptr || !status_.storage_available) {
    return std::nullopt;
  }
  return display_panel::stored(*storage_, panel_count());
}

bool ConfigurationService::choose_panel(const PanelChoice choice) {
  const std::lock_guard<std::mutex> guard(panel_lock_);
  return storage_ != nullptr && status_.storage_available &&
         display_panel::store(*storage_, choice, panel_count());
}

bool ConfigurationService::confirm_panel(const std::uint8_t panel) {
  const std::lock_guard<std::mutex> guard(panel_lock_);
  return storage_ != nullptr && status_.storage_available &&
         display_panel::confirm(*storage_, panel, panel_count());
}

bool ConfigurationService::try_next_panel() {
  const std::lock_guard<std::mutex> guard(panel_lock_);
  return storage_ != nullptr && status_.storage_available &&
         display_panel::try_next(*storage_, panel_count());
}

}
