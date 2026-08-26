#include "dashboard_fonts.hpp"

#include <algorithm>
#include <cstdint>

#include "esp_timer.h"
#include "font_glyph_allocator.hpp"
#include "logger.hpp"

namespace simcore::dashboard::fonts {
namespace {

constexpr char kTag[] = "dashboard_fonts";
constexpr std::size_t kGlyphCacheEntries = 128;

constexpr std::string_view kBaseWarmCharacters =
    "0123456789.:+- ,;/%()'\"";

constexpr char kFirstPrintable = 0x20;
constexpr char kLastPrintable = 0x7E;

class CharacterSet final {
 public:
  void add(const std::span<const char> characters) {
    for (const char character : characters) {
      if (character == '\0') {
        break;
      }
      if (character < kFirstPrintable || character > kLastPrintable) {
        continue;
      }
      const auto index = static_cast<std::size_t>(character - kFirstPrintable);
      words_[index / 32] |= 1U << (index % 32);
    }
  }

  void add(const std::string_view characters) {
    add(std::span<const char>{characters.data(), characters.size()});
  }

  [[nodiscard]] std::size_t size() const {
    std::size_t total{};
    for (const std::uint32_t word : words_) {
      total += static_cast<std::size_t>(__builtin_popcount(word));
    }
    return total;
  }

  template <typename Visitor>
  void for_each(Visitor&& visit) const {
    for (std::size_t index = 0; index < kCharacterCount; ++index) {
      if ((words_[index / 32] & (1U << (index % 32))) != 0) {
        visit(static_cast<char>(kFirstPrintable + index));
      }
    }
  }

 private:
  static constexpr std::size_t kCharacterCount =
      static_cast<std::size_t>(kLastPrintable - kFirstPrintable) + 1;

  std::array<std::uint32_t, (kCharacterCount + 31) / 32> words_{};
};

struct WarmResult {
  std::uint32_t warmed{};
  std::uint32_t missing{};
  std::uint32_t failed{};
};

[[nodiscard]] WarmResult warm_glyphs(const lv_font_t* const font,
                                     const CharacterSet& characters) {
  WarmResult result{};
  characters.for_each([font, &result](const char character) {
    lv_font_glyph_dsc_t glyph{};
    if (!lv_font_get_glyph_dsc(font, &glyph,
                               static_cast<std::uint32_t>(character), 0)) {
      ++result.missing;
      return;
    }
    if (glyph.format == LV_FONT_GLYPH_FORMAT_NONE || glyph.box_w == 0 ||
        glyph.box_h == 0) {
      return;
    }
    if (lv_font_get_glyph_bitmap(&glyph, nullptr) == nullptr) {
      ++result.failed;
    } else {
      ++result.warmed;
    }
    lv_font_glyph_release_draw_data(&glyph);
  });
  return result;
}

}

Registry::~Registry() {
  for (std::size_t index = 0; index < font_count_; ++index) {
    destroy(fonts_[index].lv_font);
  }
}

void Registry::destroy(lv_font_t* const font) {
  lv_tiny_ttf_destroy(font);
}

bool Registry::load(const std::span<const font_assets::FamilyAsset> families,
                    const std::span<std::uint8_t> storage) {
  install_external_memory_glyph_allocator();
  families_ = {};
  family_count_ = 0;
  std::span<std::uint8_t> remaining = storage;
  for (const font_assets::FamilyAsset& asset : families) {
    if (family_count_ == families_.size() ||
        asset.bytes.size() > remaining.size()) {
      log::error(kTag, "Font face storage is too small for the package");
      return false;
    }
    std::copy(asset.bytes.begin(), asset.bytes.end(), remaining.begin());
    families_[family_count_] = {
        .id = asset.family,
        .bytes = {remaining.data(), asset.bytes.size()},
    };
    ++family_count_;
    const std::size_t consumed =
        (asset.bytes.size() + font_assets::kFaceAlignment - 1) &
        ~(font_assets::kFaceAlignment - 1);
    remaining = remaining.subspan(std::min(consumed, remaining.size()));
  }
  log::info(kTag, "Loaded %u font families",
           static_cast<unsigned>(family_count_));
  return true;
}

bool Registry::has_family(const font_assets::FamilyId& family) const {
  return find_family(family) != nullptr;
}

const Registry::Family* Registry::find_family(
    const font_assets::FamilyId& family) const {
  for (std::size_t index = 0; index < family_count_; ++index) {
    if (families_[index].id == family) {
      return &families_[index];
    }
  }
  return nullptr;
}

bool Registry::acquire(const FontSpec& spec) {
  if (resolve(spec) != nullptr) {
    return true;
  }
  const Family* const family = find_family(spec.family);
  if (family == nullptr || font_count_ == fonts_.size()) {
    return false;
  }

  lv_font_t* const font = lv_tiny_ttf_create_data_ex(
      family->bytes.data(), family->bytes.size(),
      static_cast<std::int32_t>(spec.size_px), LV_FONT_KERNING_NONE,
      kGlyphCacheEntries);
  if (font == nullptr) {
    log::error(kTag, "Failed to create font %s %upx",
               font_assets::family_id_view(spec.family).data(),
               static_cast<unsigned>(spec.size_px));
    return false;
  }
  fonts_[font_count_] = {.spec = spec, .lv_font = font};
  ++font_count_;

  CharacterSet characters;
  characters.add(kBaseWarmCharacters);
  const std::int64_t started_at_us = esp_timer_get_time();
  const WarmResult result = warm_glyphs(font, characters);
  const auto elapsed_us =
      static_cast<std::uint32_t>(esp_timer_get_time() - started_at_us);
  if (result.missing != 0 || result.failed != 0) {
    log::warn(kTag, "Font %s %upx warmed %u, missing %u, failed %u in %uus",
              font_assets::family_id_view(spec.family).data(),
              static_cast<unsigned>(spec.size_px),
              static_cast<unsigned>(result.warmed),
              static_cast<unsigned>(result.missing),
              static_cast<unsigned>(result.failed),
              static_cast<unsigned>(elapsed_us));
  } else {
    log::info(kTag, "Font %s %upx warmed %u glyphs in %uus",
              font_assets::family_id_view(spec.family).data(),
              static_cast<unsigned>(spec.size_px),
              static_cast<unsigned>(result.warmed),
              static_cast<unsigned>(elapsed_us));
  }
  return true;
}

void Registry::warm(const FontSpec& spec,
                    const std::span<const char> characters) {
  const lv_font_t* const font = resolve(spec);
  if (font == nullptr || characters.empty()) {
    return;
  }
  CharacterSet set;
  set.add(characters);
  if (set.size() == 0) {
    return;
  }
  const WarmResult result = warm_glyphs(font, set);
  if (result.missing != 0 || result.failed != 0) {
    log::warn(kTag, "Font %s %upx cannot render %u of its configured characters",
              font_assets::family_id_view(spec.family).data(),
              static_cast<unsigned>(spec.size_px),
              static_cast<unsigned>(result.missing + result.failed));
  }
}

const lv_font_t* Registry::resolve(const FontSpec& spec) const {
  for (std::size_t index = 0; index < font_count_; ++index) {
    if (fonts_[index].spec == spec) {
      return fonts_[index].lv_font;
    }
  }
  return nullptr;
}

}
