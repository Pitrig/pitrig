#include "dashboard_assets.hpp"

#include <array>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_composition.hpp"
#include "dashboard_state.hpp"
#include "font_asset_service.hpp"
#include "image_asset_service.hpp"
#include "logger.hpp"
#include "esp_lvgl_port.h"

namespace simcore::dashboard_composition {
namespace {

constexpr char kTag[] = "dashboard";

// The distinct images one configuration draws. A dashboard holds at most
// kMaximumImageWidgets of them, so the set can never be larger however many the
// package carries.
using ReferencedImages =
    std::array<const image_assets::ImageAsset*, configuration::kMaximumImageWidgets>;

[[nodiscard]] const image_assets::ImageAsset* find_installed(
    const image_assets::Service& image_assets,
    const image_assets::ImageId& id) {
  for (const image_assets::ImageAsset& asset : image_assets.images()) {
    if (asset.id == id) {
      return &asset;
    }
  }
  return nullptr;
}

// Each image once, in the order the widgets name them. A widget naming an image
// that is not installed is skipped rather than failing here: whether a document
// can be composed at all is images_available's answer, and it is given before
// anything is torn down.
[[nodiscard]] std::size_t collect_referenced(
    const configuration::ApplicationConfiguration& configuration,
    const image_assets::Service& image_assets, ReferencedImages& referenced) {
  const configuration::DashboardConfiguration& dashboard = configuration.dashboard;
  std::size_t count{};
  for (std::size_t index = 0; index < dashboard.image_widget_count; ++index) {
    const image_assets::ImageAsset* const asset =
        find_installed(image_assets, dashboard.image_widgets[index].image);
    if (asset == nullptr) {
      continue;
    }
    bool seen = false;
    for (std::size_t previous = 0; previous < count; ++previous) {
      seen = seen || referenced[previous] == asset;
    }
    if (!seen && count < referenced.size()) {
      referenced[count] = asset;
      ++count;
    }
  }
  return count;
}

// Visits every caption a document carries, whatever type it sits on. A caption
// belongs to the frame, so every framed type can carry one and the traits table
// reaches all of them without naming a single type.
template <typename Visitor>
void for_each_caption(
    const configuration::DashboardConfiguration& dashboard, Visitor&& visit) {
  for (const configuration::WidgetTypeTraits& traits :
       configuration::kWidgetTypeTraits) {
    const std::uint8_t count = traits.count(dashboard);
    for (std::uint8_t index = 0; index < count; ++index) {
      const configuration::WidgetFrame* const frame =
          traits.frame(dashboard, index);
      if (frame != nullptr && frame->title.text.front() != '\0') {
        visit(frame->title);
      }
    }
  }
}

// Visits every font a configuration renders with, together with the characters
// that configuration supplies for it. Fonts the runtime emits on its own are
// warmed by the registry.
template <typename Visitor>
void for_each_configured_font(
    const configuration::ApplicationConfiguration& configuration,
    Visitor&& visit) {
  // Widget storage is one pool, so every screen's fonts are covered by walking
  // it once.
  const configuration::DashboardConfiguration& dashboard =
      configuration.dashboard;
  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    const configuration::TextWidgetConfiguration& widget =
        dashboard.text_widgets[index];
    visit(widget.value.font, widget.value.unavailable_text);
    // Affixes belong to the transform rather than to one of its types, so they
    // are rendered whatever the type is, for every source the widget composes.
    for (std::size_t source = 0; source < widget.source_count; ++source) {
      visit(widget.value.font, widget.sources[source].transform.prefix);
      visit(widget.value.font, widget.sources[source].transform.suffix);
    }
  }
  for_each_caption(dashboard, [&visit](const configuration::WidgetTitleStyle& title) {
    visit(title.font, title.text);
  });
}

// Only the face has to be installed: every pixel size is rasterized from it, so
// a configuration that asks for a size the device has never rendered composes
// without an upload. A caption needs its family installed like any other text.
[[nodiscard]] bool families_installed(
    const configuration::DashboardConfiguration& dashboard,
    const dashboard::fonts::Registry& fonts) {
  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    if (!fonts.has_family(dashboard.text_widgets[index].value.font.family)) {
      return false;
    }
  }
  bool complete = true;
  for_each_caption(dashboard,
                   [&fonts, &complete](const configuration::WidgetTitleStyle& title) {
                     complete = complete && fonts.has_family(title.font.family);
                   });
  return complete;
}

}  // namespace

namespace assets {

bool acquire_fonts(
    const configuration::ApplicationConfiguration& configuration,
    dashboard::fonts::Registry& fonts) {
  // Creating font objects and rasterizing their glyphs are LVGL calls, and
  // this runs while the LVGL task is drawing: the boot splash at startup, the
  // running dashboard during a live apply.
  if (!lvgl_port_lock(0)) {
    log::error(kTag, "Failed to lock LVGL for font creation");
    return false;
  }
  bool complete = true;
  for_each_configured_font(
      configuration, [&fonts, &complete](const font_assets::FontSpec& spec,
                                         const std::span<const char> text) {
        if (!fonts.acquire(spec)) {
          complete = false;
          return;
        }
        fonts.warm(spec, text);
      });
  lvgl_port_unlock();
  return complete;
}

void release_unused_fonts(
    const configuration::ApplicationConfiguration& configuration,
    dashboard::fonts::Registry& fonts) {
  if (!lvgl_port_lock(0)) {
    // Keeping a font that nothing draws with costs its cache and nothing else;
    // the next release gets it.
    log::warn(kTag, "Failed to lock LVGL for font release");
    return;
  }
  fonts.retain_if([&configuration](const font_assets::FontSpec& spec) {
    bool used = false;
    for_each_configured_font(
        configuration, [&spec, &used](const font_assets::FontSpec& candidate,
                                      const std::span<const char>) {
          used = used || candidate == spec;
        });
    return used;
  });
  lvgl_port_unlock();
}

}  // namespace assets

bool fonts_available(
    const configuration::ApplicationConfiguration& configuration,
    const Dashboard& state) {
  // The pool is what gets composed, so checking it directly covers every screen
  // and cannot check the same widget twice.
  return families_installed(configuration.dashboard, state.fonts);
}

std::size_t image_bytes_required(
    const configuration::ApplicationConfiguration& configuration,
    const image_assets::Service& image_assets) {
  ReferencedImages referenced{};
  const std::size_t count =
      collect_referenced(configuration, image_assets, referenced);
  std::size_t total{};
  for (std::size_t index = 0; index < count; ++index) {
    total += (referenced[index]->decoded_bytes() + image_assets::kImageAlignment - 1) &
             ~(image_assets::kImageAlignment - 1);
  }
  return total;
}

bool load_images(Dashboard& dashboard,
                 const configuration::ApplicationConfiguration& configuration,
                 const image_assets::Service& image_assets,
                 const std::span<std::uint8_t> storage) {
  ReferencedImages referenced{};
  const std::size_t count =
      collect_referenced(configuration, image_assets, referenced);
  std::array<image_assets::ImageAsset, configuration::kMaximumImageWidgets> assets{};
  for (std::size_t index = 0; index < count; ++index) {
    assets[index] = *referenced[index];
  }
  return dashboard.images.load({assets.data(), count}, storage);
}

bool images_available(
    const configuration::ApplicationConfiguration& configuration,
    const image_assets::Service& image_assets, const Dashboard& state) {
  const configuration::DashboardConfiguration& dashboard =
      configuration.dashboard;
  for (std::size_t index = 0; index < dashboard.image_widget_count; ++index) {
    const configuration::ImageWidgetConfiguration& widget =
        dashboard.image_widgets[index];
    // The package first, because that is what a reload would draw from; what is
    // already loaded second, because between an upload and its restart there is
    // no package left to reload and the registry is all there is. A frame past
    // what the sheet holds is refused here for the same reason a missing image
    // is — the document is rejected while the running dashboard is still
    // intact, rather than failing inside a build that has already begun.
    const image_assets::ImageAsset* const asset =
        find_installed(image_assets, widget.image);
    const std::size_t frames =
        asset != nullptr ? asset->frame_count : state.images.frame_count(widget.image);
    if (frames == 0 || widget.sprite_frame >= frames) {
      return false;
    }
    // A source on an image with nothing to switch between would sit read and
    // unused, which the contract refuses the same way it refuses an unread
    // binding anywhere else.
    if (widget.sprite_frame_source_present && frames < 2) {
      return false;
    }
  }
  return true;
}

bool images_loaded(const configuration::ApplicationConfiguration& configuration,
                   const Dashboard& state) {
  const configuration::DashboardConfiguration& dashboard =
      configuration.dashboard;
  for (std::size_t index = 0; index < dashboard.image_widget_count; ++index) {
    if (!state.images.has_image(dashboard.image_widgets[index].image)) {
      return false;
    }
  }
  return true;
}

bool load_fonts(Dashboard& dashboard, const font_assets::Service& font_assets,
                const std::span<std::uint8_t> storage) {
  if (!lvgl_port_lock(0)) {
    log::error(kTag, "Failed to lock LVGL for font loading");
    return false;
  }
  const bool loaded = dashboard.fonts.load(font_assets.families(), storage);
  lvgl_port_unlock();
  return loaded;
}


}  // namespace simcore::dashboard_composition
