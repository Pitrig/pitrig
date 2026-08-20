/**
 * Whether the document carries something of its own here, rather than leaving
 * the device to the default it would use anyway.
 *
 * This is what the inspector's dot means, and it is deliberately not "the key
 * is present": the add button of every repeated row writes its defaults out, so
 * presence alone would light up every lamp, ramp stop and condition rule the
 * moment it was created and then say nothing about what was changed afterwards.
 *
 * The fallback passed in is the device's own default, taken from
 * `configuration/configuration_schema.json` — the same value the field beside
 * it displays through `??`, so the two can never drift apart unnoticed.
 */
export function authored<T>(current: T | undefined, fallback: T): boolean {
  return current !== undefined && current !== fallback
}
