import type { ConditionOperator } from './configuration-schema'

// Mirrors kMinimumBlinkMs and kMaximumBlinkMs in
// firmware/services/configuration/src/configuration_validation.cpp, which is
// where the bound is a decision: faster reads as a strobe, slower as a widget
// that failed to update.
export const MINIMUM_BLINK_MS = 100
export const MAXIMUM_BLINK_MS = 5000

// Same file, kMaximumHoldMs: how long a rule may outlive the match that
// triggered it before it reads as a stuck widget rather than a reaction.
export const MAXIMUM_HOLD_MS = 10000

// The comparisons that mean anything against a field with two states.
export const BOOLEAN_OPERATORS: readonly ConditionOperator[] = ['equal', 'not_equal']
