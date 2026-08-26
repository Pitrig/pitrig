import type { ConditionOperator } from './configuration-schema'

export {
  MINIMUM_BLINK_MS,
  MAXIMUM_BLINK_MS,
  MAXIMUM_HOLD_MS
} from './configuration-schema'

export const BOOLEAN_OPERATORS: readonly ConditionOperator[] = ['equal', 'not_equal']
