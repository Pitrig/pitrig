#pragma once

namespace pitrig::dashboard::graph_widget {

void lock_sampler();

void unlock_sampler();

class SamplerLock final {
 public:
  SamplerLock() { lock_sampler(); }
  ~SamplerLock() { unlock_sampler(); }

  SamplerLock(const SamplerLock&) = delete;
  SamplerLock& operator=(const SamplerLock&) = delete;
};

}
