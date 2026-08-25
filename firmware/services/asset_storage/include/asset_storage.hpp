#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

namespace simcore::asset_storage {

// The byte store one uploaded asset package lives in. Nothing here knows what a
// package contains, which is what lets fonts and images share it: each asset
// service owns its own format and validation, and the storage owns the flash.
//
// The ordering rules are the load-bearing part. A mapping and a write cannot
// coexist, so `write` and `erase` release the mapping first, and a consumer
// holding spans into it must have copied what it needs before an update starts.
class IStorage {
 public:
  virtual ~IStorage() = default;

  [[nodiscard]] virtual bool initialize() = 0;
  [[nodiscard]] virtual bool map(std::span<const std::uint8_t>& bytes) = 0;
  virtual void unmap() = 0;
  // The whole store, for removing a package rather than replacing one.
  [[nodiscard]] virtual bool erase() = 0;
  // Only what a package of `bytes` occupies, rounded up to the erase
  // granularity. Nothing reads past a package, so an update need not pay for
  // the rest of the store.
  [[nodiscard]] virtual bool erase(std::size_t bytes) = 0;
  [[nodiscard]] virtual bool write(std::size_t offset,
                                   std::span<const std::uint8_t> bytes) = 0;
};

}  // namespace simcore::asset_storage
