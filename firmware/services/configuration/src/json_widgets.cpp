#include "json_widgets.hpp"

#include <array>
#include <cstddef>
#include <string_view>

#include "configuration_schema_generated.hpp"
#include "json_readers.hpp"
#include "json_value_pipeline.hpp"
#include "json_widget_variants.hpp"

namespace simcore::configuration::json {
namespace {

// One container's `widgets` array. A screen, a shape and a slot page differ only
// in the table they fill and the error they report, so the walk itself is
// written once. `depth` is the container's own level; the children take the next
[[nodiscard]] bool parse_children(const cJSON* const children,
                                  DashboardConfiguration& dashboard,
                                  const ReferenceTable& owner,
                                  const std::uint8_t screen_index,
                                  const ParentRef& parent,
                                  const std::uint8_t depth,
                                  const ValidationError error,
                                  const std::string_view name,
                                  ValidationFailure& failure) {
  if (children == nullptr) {
    return true;
  }
  const int count = cJSON_IsArray(children) ? cJSON_GetArraySize(children) : -1;
  if (count < 0 || count > static_cast<int>(owner.entries.size())) {
    return reject(failure, error, name, "widgets");
  }
  for (int index = 0; index < count; ++index) {
    if (!parse_widget(cJSON_GetArrayItem(children, index), dashboard, owner,
                      screen_index, parent,
                      static_cast<std::uint8_t>(depth + 1), failure)) {
      // Only the innermost failure names its position; an outer level would
      // otherwise overwrite it with its own, which is the less useful one.
      if (failure.widget_index < 0) {
        failure.widget_index = static_cast<std::int16_t>(index);
      }
      return false;
    }
  }
  return true;
}

}  // namespace

bool parse_widget(const cJSON* const object, DashboardConfiguration& dashboard,
                  const ReferenceTable& owner, const std::uint8_t screen_index,
                  const ParentRef& parent, const std::uint8_t depth,
                  ValidationFailure& failure) {
  constexpr std::string_view kName = "widget";
  if (!cJSON_IsObject(object)) {
    return reject(failure, ValidationError::invalid_widget, kName);
  }
  if (depth >= kMaximumNestingDepth) {
    return reject(failure, ValidationError::invalid_widget, kName, "widgets");
  }
  const cJSON* const type = member(object, "type");
  WidgetType widget_type{};
  if (!cJSON_IsString(type) || type->valuestring == nullptr ||
      !widget_type_from_name(std::string_view{type->valuestring},
                             widget_type)) {
    return reject(failure, ValidationError::invalid_widget, kName, "type");
  }
  // A slot is built before every container that could hold one, which is what
  // keeps composition to one pass per widget type. Refusing it here rather than
  // in validation is what makes the schema's variant maps the whole statement of
  // where a slot may appear.
  if (widget_type == WidgetType::slot &&
      parent.kind != WidgetParentKind::screen) {
    return reject(failure, ValidationError::invalid_slot, "widget.slot",
                  "type");
  }
  if (*owner.count >= owner.entries.size()) {
    switch (parent.kind) {
      case WidgetParentKind::shape:
        return reject(failure, ValidationError::invalid_widget, "widget.shape",
                      "widgets");
      case WidgetParentKind::slot_page:
        return reject(failure, ValidationError::invalid_slot_page,
                      "widget.slot.pages", "widgets");
      case WidgetParentKind::screen:
        break;
    }
    return reject(failure, ValidationError::invalid_screen, "screen",
                  "widgets");
  }

  const WidgetTypeTraits& traits = widget_traits(widget_type);
  const std::uint8_t storage_index = traits.count(dashboard);
  if (storage_index >= traits.capacity) {
    return reject(failure, ValidationError::invalid_dashboard, "dashboard",
                  traits.storage_key);
  }
  if (!kWidgetParsers[static_cast<std::size_t>(widget_type)](
          object, dashboard, storage_index, failure)) {
    return false;
  }
  // Counted first, because the traits table refuses to hand out a frame past
  // the count — which is exactly what keeps every other caller in range.
  traits.set_count(dashboard, static_cast<std::uint8_t>(storage_index + 1));

  // Parenting is stamped once after the variant is parsed, so a widget type
  // knows nothing about screens or containers.
  WidgetFrame* const frame = traits.mutable_frame(dashboard, storage_index);
  frame->screen_index = screen_index;
  frame->parent_index = parent.index;
  frame->parent_kind = parent.kind;
  // Carrying the ordering key on the reference keeps compositing free of
  // widget-type knowledge.
  owner.entries[*owner.count] = {
      .type = widget_type,
      .index = storage_index,
      .z_index = frame->z_index,
  };
  ++*owner.count;

  // Recursing last is what orders the pool: this container is already counted,
  // so every widget below it takes a higher pool index than its parent, and a
  // cycle becomes unrepresentable rather than merely rejected. The references
  // below stay valid across the calls because the pools are fixed-size arrays
  // that nothing here can grow or move.
  switch (widget_type) {
    case WidgetType::shape: {
      ShapeWidgetConfiguration& container =
          dashboard.shape_widgets[storage_index];
      return parse_children(
          member(object, "widgets"), dashboard,
          ReferenceTable{container.widgets, &container.widget_count},
          screen_index,
          ParentRef{WidgetParentKind::shape, storage_index}, depth,
          ValidationError::invalid_widget, "widget.shape", failure);
    }
    case WidgetType::slot: {
      SlotWidgetConfiguration& slot = dashboard.slot_widgets[storage_index];
      // Pages are addressed by arithmetic rather than by a pool of their own,
      // so the base is fixed the moment the slot takes its pool index.
      const std::uint8_t base =
          static_cast<std::uint8_t>(storage_index * kMaximumSlotPages);
      const cJSON* const pages = member(object, "pages");
      for (std::uint8_t page = 0; page < slot.page_count; ++page) {
        SlotPageConfiguration& config = slot.pages[page];
        if (!parse_children(
                member(cJSON_GetArrayItem(pages, page), "widgets"), dashboard,
                ReferenceTable{config.widgets, &config.widget_count},
                screen_index,
                ParentRef{WidgetParentKind::slot_page,
                          static_cast<std::uint8_t>(base + page)},
                // A page costs no nesting level. The bound exists to cap the
                // parser's own recursion, and a page adds none: it is walked
                // here rather than through parse_widget. Charging for it would
                // only buy the author one level less inside a slot than
                // outside one, for nothing.
                depth, ValidationError::invalid_slot_page, "widget.slot.pages",
                failure)) {
          return false;
        }
      }
      return true;
    }
    default:
      return true;
  }
}

}  // namespace simcore::configuration::json
