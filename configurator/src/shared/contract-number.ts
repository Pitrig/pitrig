/**
 * Numbers the configuration contract stores as 32-bit floats.
 *
 * `WidgetCondition.value`, `SlotCondition.value`, `ColorStop.at`,
 * `ValueRange.minimum`/`maximum`, a bar's `origin`, an indicator segment's
 * `threshold` and a number transform's `scale`/`offset` are every one of them
 * `float` in `application_configuration_generated.hpp` — and so is a `float32`
 * telemetry reading. JSON carries them at double precision, so a mirror that
 * compares or scales with the authored double is answering a question the
 * device never asked: the board does not hold `0.1`, it holds the nearest
 * float to it, and at a boundary the two disagree about which side a value
 * falls on. A rule reading `not_equal 0.05` against a source at `0.05` matches
 * in double precision and does not on the glass.
 *
 * Narrow where a contract number enters the arithmetic, and the preview lands
 * on the same side of a threshold as the display does.
 */
export function deviceFloat(value: number): number {
  return Math.fround(value)
}
