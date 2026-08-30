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

template <typename Visitor>
void for_each_caption(
    const configuration::DashboardConfiguration& dashboard, Visitor&& visit) {
  configuration::for_each_widget_frame(
      dashboard, [&visit](const configuration::WidgetFrame& frame) {
        if (frame.title.text.front() != '\0') {
          visit(frame.title);
        }
      });
}

template <typename Visitor>
void visit_font(const font_assets::FontSpec& font,
                const std::span<const char> text, Visitor&& visit) {
  visit(font, text);
  if (font_assets::has_fallback(font)) {
    visit(font_assets::fallback_spec(font), text);
  }
}

template <typename Visitor>
void for_each_configured_font(
    const configuration::ApplicationConfiguration& configuration,
    Visitor&& visit) {
  const configuration::DashboardConfiguration& dashboard =
      configuration.dashboard;
  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    const configuration::TextWidgetConfiguration& widget =
        dashboard.text_widgets[index];
    visit_font(widget.value.font, widget.value.unavailable_text, visit);
    for (std::size_t source = 0; source < widget.source_count; ++source) {
      visit_font(widget.value.font, widget.sources[source].transform.prefix,
                 visit);
      visit_font(widget.value.font, widget.sources[source].transform.suffix,
                 visit);
    }
  }
  for_each_caption(dashboard, [&visit](const configuration::WidgetTitleStyle& title) {
    visit_font(title.font, title.text, visit);
  });
}

[[nodiscard]] bool families_installed(
    const configuration::DashboardConfiguration& dashboard,
    const dashboard::fonts::Registry& fonts) {
  const auto installed = [&fonts](const font_assets::FontSpec& font) {
    return fonts.has_family(font.family) &&
           (!font_assets::has_fallback(font) || fonts.has_family(font.fallback));
  };
  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    if (!installed(dashboard.text_widgets[index].value.font)) {
      return false;
    }
  }
  bool complete = true;
  for_each_caption(dashboard,
                   [&installed, &complete](const configuration::WidgetTitleStyle& title) {
                     complete = complete && installed(title.font);
                   });
  return complete;
}

}

namespace assets {

bool acquire_fonts(
    const configuration::ApplicationConfiguration& configuration,
    dashboard::fonts::Registry& fonts) {
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

}

bool fonts_available(
    const configuration::ApplicationConfiguration& configuration,
    const Dashboard& state) {
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
    const image_assets::ImageAsset* const asset =
        find_installed(image_assets, widget.image);
    const std::size_t frames =
        asset != nullptr ? asset->frame_count : state.images.frame_count(widget.image);
    if (frames == 0 || widget.sprite_frame >= frames) {
      return false;
    }
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


}
