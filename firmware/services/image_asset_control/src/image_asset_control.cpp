#include "image_asset_control.hpp"

#include <cstdio>

namespace simcore::image_assets {
namespace {

// The engine reports failures as the protocol's word, so each operation turns
// this kind's enumeration into one. Success is a null word.
[[nodiscard]] const char* word_for(const UpdateError error) {
  return error == UpdateError::none ? nullptr : update_error_name(error);
}

[[nodiscard]] Service& service_of(void* const service) {
  return *static_cast<Service*>(service);
}

const char* begin_update(void* const service, const std::size_t package_size) {
  return word_for(service_of(service).begin_update(package_size));
}

const char* write_update(void* const service,
                         const std::span<const std::uint8_t> bytes) {
  return word_for(service_of(service).write_update(bytes));
}

const char* commit_update(void* const service) {
  return word_for(service_of(service).commit_update());
}

const char* clear(void* const service) {
  return word_for(service_of(service).clear());
}

void cancel_update(void* const service) { service_of(service).cancel_update(); }

// Everything after `@SC:OK:IMAGE:INFO:` and before the newline. Each entry
// carries its geometry, which is what lets the configurator tell whether an
// installed image still suits the dashboard without re-uploading to find out.
// A sprite sheet adds its frame count as a fourth field; an ordinary image has
// one frame and says nothing, so the line a host already knows how to read is
// unchanged for every image that is not a sheet.
int write_info_body(void* const service, char* const out,
                    const std::size_t size) {
  const Status& status = service_of(service).status();
  int written = std::snprintf(
      out, size,
      "storage=%u,package=%u,format=%u,images=%u,size=%lu,reboot_required=%u,entries=",
      status.storage_available ? 1U : 0U, status.package_available ? 1U : 0U,
      static_cast<unsigned>(status.format_version),
      static_cast<unsigned>(status.entry_count),
      static_cast<unsigned long>(status.package_size),
      status.reboot_required ? 1U : 0U);
  if (written <= 0 || static_cast<std::size_t>(written) >= size) {
    return -1;
  }
  auto offset = static_cast<std::size_t>(written);
  const auto images = service_of(service).image_catalog();
  for (std::size_t index = 0; index < images.size(); ++index) {
    const auto id = image_id_view(images[index].id);
    const unsigned frames = images[index].frame_count;
    written = std::snprintf(out + offset, size - offset, "%s%.*s:%ux%u:%s",
                            index == 0 ? "" : ";", static_cast<int>(id.size()),
                            id.data(), static_cast<unsigned>(images[index].width),
                            static_cast<unsigned>(images[index].height),
                            color_format_name(images[index].format));
    if (written > 0 && static_cast<std::size_t>(written) < size - offset &&
        frames > 1) {
      const int extra = std::snprintf(out + offset + written,
                                      size - offset - written, ":%u", frames);
      written = extra > 0 ? written + extra : extra;
    }
    if (written <= 0 || static_cast<std::size_t>(written) >= size - offset) {
      return -1;
    }
    offset += static_cast<std::size_t>(written);
  }
  return static_cast<int>(offset);
}

}  // namespace

bool ImageAssetControl::initialize(Service& service,
                                   binary_session::Claim& claim) {
  return control_.initialize(
      {
          .tag = "IMAGE",
          .task_name = "image_asset_control",
          .metric = performance::TaskMetric::image_asset_control,
      },
      {
          .service = &service,
          .begin_update = &begin_update,
          .write_update = &write_update,
          .commit_update = &commit_update,
          .clear = &clear,
          .cancel_update = &cancel_update,
          .write_info_body = &write_info_body,
      },
      claim);
}

}  // namespace simcore::image_assets
