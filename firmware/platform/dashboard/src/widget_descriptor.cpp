#include "widget_descriptor.hpp"

namespace simcore::dashboard {

WidgetManager::~WidgetManager() {
  destroy_all();
}

bool WidgetManager::add(const WidgetDescriptor& descriptor) {
  if (count_ == entries_.size() || descriptor.create == nullptr ||
      descriptor.destroy == nullptr || descriptor.root_object == nullptr ||
      descriptor.update_instance == nullptr || descriptor.context == nullptr) {
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

}  // namespace simcore::dashboard
