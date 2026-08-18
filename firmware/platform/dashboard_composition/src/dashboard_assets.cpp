#include "dashboard_assets.hpp"

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

bool prepare_fonts(
    const configuration::ApplicationConfiguration& configuration,
    dashboard::fonts::Registry& fonts) {
  // Destroying and creating font objects, and rasterizing their glyphs, are
  // LVGL calls, and this runs while the LVGL task is drawing: the boot splash
  // at startup, the previous dashboard during a live apply.
  if (!lvgl_port_lock(0)) {
    log::error(kTag, "Failed to lock LVGL for font preparation");
    return false;
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

}  // namespace assets

bool fonts_available(
    const configuration::ApplicationConfiguration& configuration,
    const Dashboard& state) {
  // The pool is what gets composed, so checking it directly covers every screen
  // and cannot check the same widget twice.
  return families_installed(configuration.dashboard, state.fonts);
}

bool images_available(
    const configuration::ApplicationConfiguration& configuration,
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

bool load_images(Dashboard& dashboard, const image_assets::Service& image_assets,
                 const std::span<std::uint8_t> storage) {
  return dashboard.images.load(image_assets.images(), storage);
}

}  // namespace simcore::dashboard_composition
