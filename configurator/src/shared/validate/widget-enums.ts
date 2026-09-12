import {
  ARC_MARK_VALUES,
  BAR_ORIENTATION_VALUES,
  COLOR_RAMP_TARGET_VALUES,
  CONDITION_OPERATOR_VALUES,
  FILL_CORNERS_VALUES,
  GRADIENT_DIRECTION_VALUES,
  INDICATOR_SHAPE_VALUES,
  RING_CENTERING_VALUES,
  SHAPE_KIND_VALUES,
  SLOT_TRIGGER_VALUES,
  TEXT_ALIGNMENT_VALUES,
  VALUE_MODIFIER_TYPE_VALUES,
  VALUE_TRANSFORM_TYPE_VALUES,
  WIDGET_ACTION_TYPE_VALUES,
  type SlotWidgetConfiguration,
  type WidgetConfiguration
} from '../configuration-schema'
import { arrayOf, pagesOf, widgetSources } from '../configuration-access'
import { badBoolean, badEnum } from './values'

type Check = string | undefined

function frameChecks(widget: WidgetConfiguration, label: string): Check[] {
  return [
    badEnum(widget.background_grad_dir, GRADIENT_DIRECTION_VALUES, label, 'background_grad_dir'),
    badEnum(widget.fill_corners, FILL_CORNERS_VALUES, label, 'fill_corners'),
    badEnum(widget.title?.alignment, TEXT_ALIGNMENT_VALUES, label, 'title.alignment'),
    badBoolean(widget.title?.border_gap, label, 'title.border_gap'),
    badEnum(widget.color_ramp?.target, COLOR_RAMP_TARGET_VALUES, label, 'color_ramp.target'),
    badEnum(widget.action?.type, WIDGET_ACTION_TYPE_VALUES, label, 'action.type')
  ]
}

function ruleChecks(widget: WidgetConfiguration, label: string): Check[] {
  return arrayOf(widget.conditions).flatMap((rule, index) => [
    badEnum(rule?.op, CONDITION_OPERATOR_VALUES, label, `conditions[${index}].op`),
    badBoolean(rule?.hidden, label, `conditions[${index}].hidden`)
  ])
}

function modifierChecks(widget: WidgetConfiguration, label: string): Check[] {
  return widgetSources(widget).flatMap((source, index) =>
    arrayOf(source?.modifiers).map((modifier, at) =>
      badEnum(
        modifier?.type,
        VALUE_MODIFIER_TYPE_VALUES,
        label,
        `sources[${index}].modifiers[${at}].type`
      )
    )
  )
}

function pageChecks(widget: SlotWidgetConfiguration, label: string): Check[] {
  return pagesOf(widget).flatMap((page, index) => [
    badEnum(page.trigger, SLOT_TRIGGER_VALUES, label, `pages[${index}].trigger`),
    badBoolean(page.in_loop, label, `pages[${index}].in_loop`),
    ...arrayOf(page.conditions).map((rule, at) =>
      badEnum(rule?.op, CONDITION_OPERATOR_VALUES, label, `pages[${index}].conditions[${at}].op`)
    )
  ])
}

function typeChecks(widget: WidgetConfiguration, label: string): Check[] {
  switch (widget.type) {
    case 'text':
      return [
        badEnum(widget.value?.alignment, TEXT_ALIGNMENT_VALUES, label, 'value.alignment'),
        ...arrayOf(widget.sources).map((source, index) =>
          badEnum(
            source?.transform?.type,
            VALUE_TRANSFORM_TYPE_VALUES,
            label,
            `sources[${index}].transform.type`
          )
        )
      ]
    case 'shape':
      return [
        badEnum(widget.kind, SHAPE_KIND_VALUES, label, 'kind'),
        badBoolean(widget.clip_children, label, 'clip_children')
      ]
    case 'bar':
      return [
        badEnum(widget.orientation, BAR_ORIENTATION_VALUES, label, 'orientation'),
        badBoolean(widget.inverted, label, 'inverted')
      ]
    case 'arc':
      return [
        badEnum(widget.mark, ARC_MARK_VALUES, label, 'mark'),
        badEnum(widget.centering, RING_CENTERING_VALUES, label, 'centering'),
        badBoolean(widget.inverted, label, 'inverted')
      ]
    case 'indicator':
      return [
        badEnum(widget.shape, INDICATOR_SHAPE_VALUES, label, 'shape'),
        badEnum(widget.orientation, BAR_ORIENTATION_VALUES, label, 'orientation'),
        badEnum(widget.centering, RING_CENTERING_VALUES, label, 'centering'),
        badBoolean(widget.inverted, label, 'inverted')
      ]
    case 'slot':
      return [badBoolean(widget.clip_children, label, 'clip_children'), ...pageChecks(widget, label)]
    default:
      return []
  }
}

export function findEnumError(widget: WidgetConfiguration, label: string): string | undefined {
  return [
    ...frameChecks(widget, label),
    ...ruleChecks(widget, label),
    ...modifierChecks(widget, label),
    ...typeChecks(widget, label)
  ].find((entry) => entry !== undefined)
}
