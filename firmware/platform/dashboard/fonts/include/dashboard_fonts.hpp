#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"
#include "font_asset_service.hpp"
#include "lvgl.h"

namespace simcore::dashboard::fonts {

// One font object per family and pixel size the active configuration asks for.
// A document cannot reference more than this: a text widget contributes a value
// font and a caption font, and every other framed type contributes a caption.
// A slot draws nothing, so validation refuses it a caption and it contributes
// no font.
inline constexpr std::size_t kMaximumFonts =
    configuration::kMaximumTextWidgets * 2 +
    configuration::kMaximumShapeWidgets + configuration::kMaximumBarWidgets +
    configuration::kMaximumArcWidgets +
    configuration::kMaximumIndicatorWidgets +
    configuration::kMaximumGraphWidgets + configuration::kMaximumImageWidgets;

class Registry final {
 public:
  Registry() = default;
  ~Registry();
  Registry(const Registry&) = delete;
  Registry& operator=(const Registry&) = delete;

  // Copies every uploaded face into caller-owned storage that outlives the
  // package mapping, because a rasterizer reads the face on every cache miss
  // and the next font upload releases that mapping while the dashboard runs.
  // Call once per boot, after LVGL exists.
  [[nodiscard]] bool load(std::span<const font_assets::FamilyAsset> families,
                          std::span<std::uint8_t> storage);

  // Reports whether a face is installed. Any pixel size of an installed family
  // can be created, so this is what a configuration is checked against.
  [[nodiscard]] bool has_family(const font_assets::FamilyId& family) const;

  // Creates the font for this family and size if it does not exist yet and
  // warms the characters the runtime emits on its own. Must run under the LVGL
  // lock.
  [[nodiscard]] bool acquire(const FontSpec& spec);

  // Warms characters the configuration supplies. Safe to repeat: an already
  // cached glyph costs one cache lookup.
  void warm(const FontSpec& spec, std::span<const char> characters);

  // Resolves an exact family and pixel size that acquire() already created.
  // Returns nullptr otherwise; there is no fallback font.
  [[nodiscard]] const lv_font_t* resolve(const FontSpec& spec) const;

  // Destroys every font the predicate rejects. Must run under the LVGL lock
  // with no widget still pointing at a font object. Taking a predicate rather
  // than a list keeps the caller from building a font table on its stack.
  template <typename Predicate>
  void retain_if(Predicate keep) {
    std::size_t retained{};
    for (std::size_t index = 0; index < font_count_; ++index) {
      const Font font = fonts_[index];
      if (keep(font.spec)) {
        fonts_[retained] = font;
        ++retained;
      } else {
        destroy(font.lv_font);
      }
    }
    for (std::size_t index = retained; index < font_count_; ++index) {
      fonts_[index] = {};
    }
    font_count_ = retained;
  }

 private:
  struct Family {
    font_assets::FamilyId id{};
    std::span<const std::uint8_t> bytes{};
  };

  struct Font {
    FontSpec spec{};
    lv_font_t* lv_font{};
  };

  [[nodiscard]] const Family* find_family(
      const font_assets::FamilyId& family) const;
  static void destroy(lv_font_t* font);

  std::array<Family, font_assets::kMaximumFamilies> families_{};
  std::size_t family_count_{};
  std::array<Font, kMaximumFonts> fonts_{};
  std::size_t font_count_{};
};

}  // namespace simcore::dashboard::fonts
