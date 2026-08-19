import type { ConditionOperator } from './configuration-schema'

// The blink window and the hold bound are generated from
// configuration/configuration_schema.json, the same source the device checks
// them from. Re-exported here so the editors that already import this file for
// the operator lists keep one import.
export {
  MINIMUM_BLINK_MS,
  MAXIMUM_BLINK_MS,
  MAXIMUM_HOLD_MS
} from './configuration-schema'

// The comparisons that mean anything against a field with two states.
export const BOOLEAN_OPERATORS: readonly ConditionOperator[] = ['equal', 'not_equal']
