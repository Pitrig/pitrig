#include "widget_descriptor.hpp"

namespace simcore::dashboard {

WidgetManager::~WidgetManager() {
  destroy_all();
}

bool WidgetManager::add(const WidgetDescriptor& descriptor) {
  if (count_ == entries_.size() || descriptor.create == nullptr ||
      descriptor.destroy == nullptr || descriptor.root_object == nullptr ||
      descriptor.update_instance == nullptr || descriptor.sync_count == nullptr ||
      descriptor.context == nullptr) {
    return false;
  }
  entries_[count_++].descriptor = descriptor;
  return true;
}

bool WidgetManager::create_all() {
  bool successful = true;
  for (std::size_t index = 0; index < count_; ++index) {
    Entry& entry = entries_[index];
    if (!entry.descriptor.enabled || entry.created) {
      continue;
    }
    entry.created = entry.descriptor.create(entry.descriptor.context);
    successful = entry.created && successful;
  }
  return successful;
}

void WidgetManager::destroy_all() {
  for (std::size_t index = count_; index > 0; --index) {
    Entry& entry = entries_[index - 1];
    if (!entry.created) {
      continue;
    }
    entry.descriptor.destroy(entry.descriptor.context);
    entry.created = false;
  }
}

void WidgetManager::clear() {
  destroy_all();
  entries_.fill({});
  count_ = 0;
}

lv_obj_t* WidgetManager::root_object(const configuration::WidgetType type,
                                     const std::uint8_t index) const {
  for (std::size_t entry = 0; entry < count_; ++entry) {
    const Entry& candidate = entries_[entry];
    if (candidate.created && candidate.descriptor.type == type) {
      return candidate.descriptor.root_object(candidate.descriptor.context,
                                              index);
    }
  }
  return nullptr;
}

bool WidgetManager::update_instance(const configuration::WidgetType type,
                                    const std::uint8_t index) const {
  for (std::size_t entry = 0; entry < count_; ++entry) {
    const Entry& candidate = entries_[entry];
    if (candidate.created && candidate.descriptor.type == type) {
      return candidate.descriptor.update_instance(candidate.descriptor.context,
                                                  index);
    }
  }
  return false;
}

configuration::WidgetType WidgetManager::type_at(
    const std::size_t index) const {
  return index < count_ ? entries_[index].descriptor.type
                        : configuration::WidgetType{};
}

bool WidgetManager::sync_count(const configuration::WidgetType type,
                               const std::uint8_t count) {
  for (std::size_t entry = 0; entry < count_; ++entry) {
    Entry& candidate = entries_[entry];
    if (candidate.descriptor.type != type) {
      continue;
    }
    if (!candidate.descriptor.sync_count(candidate.descriptor.context, count)) {
      return false;
    }
    // Created is what the destroy pass and every lookup read, and the extend is
    // what creates the pool — at any count. An empty pool is created rather than
    // absent, which is the whole reason a type the previous document had none of
    // can be extended at all; making this depend on `count > 0` left the pool
    // created as far as the collection was concerned and absent as far as the
    // manager was, so `destroy_all` skipped it and the next full composition
    // refused to build a pool that already believed it existed.
    candidate.created = true;
    return true;
  }
  return false;
}

void WidgetManager::wake_all() const {
  for (std::size_t entry = 0; entry < count_; ++entry) {
    const Entry& candidate = entries_[entry];
    if (candidate.created && candidate.descriptor.wake != nullptr) {
      candidate.descriptor.wake(candidate.descriptor.context);
    }
  }
}

}  // namespace simcore::dashboard
