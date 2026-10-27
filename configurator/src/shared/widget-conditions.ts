import { CONDITION_OPERATOR_VALUES, type ConditionOperator } from './configuration-schema'
import { TELEMETRY_CATALOG } from './telemetry-catalog'

export {
  MINIMUM_BLINK_MS,
  MAXIMUM_BLINK_MS,
  MAXIMUM_HOLD_MS
} from './configuration-schema'

export const BOOLEAN_OPERATORS: readonly ConditionOperator[] = ['equal', 'not_equal']
export const BITMASK_OPERATORS: readonly ConditionOperator[] = ['bit_set', 'equal', 'not_equal']
export const NUMBER_OPERATORS: readonly ConditionOperator[] = CONDITION_OPERATOR_VALUES.filter(
  (operator) => operator !== 'bit_set'
)

const HIGHEST_BIT = 32
const BITMASK_LIMIT = 2 ** 32

export function operatorsFor(binding: string | undefined): readonly ConditionOperator[] {
  const field = TELEMETRY_CATALOG.find(({ name }) => name === binding)
  if (field?.type === 'boolean') return BOOLEAN_OPERATORS
  return field?.unit === 'bitmask' ? BITMASK_OPERATORS : NUMBER_OPERATORS
}

export function bitSet(value: number, bit: number): boolean {
  if (!(bit >= 1 && bit <= HIGHEST_BIT) || !(value >= 0 && value < BITMASK_LIMIT)) return false
  return ((Math.trunc(value) >>> (Math.trunc(bit) - 1)) & 1) === 1
}
