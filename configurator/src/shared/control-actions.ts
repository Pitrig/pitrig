import { CONTROL_ACTION_VALUES, type ControlAction } from './configuration-schema'

export const SCREEN_ACTIONS: ReadonlySet<ControlAction> = new Set(['show_screen', 'hold_screen'])

export const SLOT_ACTIONS: ReadonlySet<ControlAction> = new Set([
  'next_page',
  'previous_page',
  'show_page',
  'hold_page',
  'dismiss_page'
])

export const PAGE_ACTIONS: ReadonlySet<ControlAction> = new Set(['show_page', 'hold_page'])

export const WRAP_ACTIONS: ReadonlySet<ControlAction> = new Set([
  'next_screen',
  'previous_screen',
  'next_page',
  'previous_page'
])

export const REPEAT_ACTIONS: ReadonlySet<ControlAction> = new Set([
  'next_screen',
  'previous_screen',
  'next_page',
  'previous_page',
  'display_brighter',
  'display_dimmer',
  'leds_brighter',
  'leds_dimmer'
])

const LED_ACTIONS: ReadonlySet<ControlAction> = new Set(['leds_brighter', 'leds_dimmer', 'leds_toggle'])

export function actionsFor(display: boolean): readonly ControlAction[] {
  return display ? CONTROL_ACTION_VALUES : CONTROL_ACTION_VALUES.filter((action) => LED_ACTIONS.has(action))
}
