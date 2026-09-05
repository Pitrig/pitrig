#include "module_manager.hpp"

namespace pitrig::modules {

Manager::~Manager() {
  stop_all();
}

bool Manager::add(const Descriptor& descriptor) {
  if (count_ == entries_.size() || descriptor.start == nullptr ||
      descriptor.stop == nullptr || descriptor.context == nullptr) {
    return false;
  }
  entries_[count_++].descriptor = descriptor;
  return true;
}

bool Manager::start_all() {
  bool successful = true;
  for (std::size_t index = 0; index < count_; ++index) {
    Entry& entry = entries_[index];
    if (!entry.descriptor.enabled || entry.started) {
      continue;
    }
    entry.started = entry.descriptor.start(entry.descriptor.context);
    successful = entry.started && successful;
  }
  return successful;
}

void Manager::stop_all() {
  for (std::size_t index = count_; index > 0; --index) {
    Entry& entry = entries_[index - 1];
    if (!entry.started) {
      continue;
    }
    entry.descriptor.stop(entry.descriptor.context);
    entry.started = false;
  }
}

void Manager::clear() {
  stop_all();
  entries_.fill({});
  count_ = 0;
}

}
