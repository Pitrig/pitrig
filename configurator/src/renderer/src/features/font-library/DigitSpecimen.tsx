/**
 * The ten digits in the face itself, and whether they are all one width.
 *
 * A dashboard is mostly numbers that change several times a second. A face
 * whose digits are proportional reflows the reading every time a 1 becomes an
 * 8, so the value shifts sideways while it is being read — and the font's name
 * does not tell you which kind it is: Roboto is not monospaced but its digits
 * are tabular, while Inter's are not.
 *
 * The answer is read from the face's own advance widths in the main process,
 * not measured here. Measuring in the browser answers about whichever font it
 * actually resolved, so a face that had not finished registering reported the
 * fallback's digits — and the fallback is tabular, which made the wrong answer
 * the confident-looking one.
 */
export function DigitSpecimen({
  cssFamily,
  tabularDigits
}: {
  cssFamily?: string
  tabularDigits?: boolean
}): React.JSX.Element | null {
  if (!cssFamily && tabularDigits === undefined) return null
  return (
    <span className="flex items-baseline gap-2">
      {cssFamily ? (
        <span className="truncate text-[0.8rem] leading-none" style={{ fontFamily: cssFamily }}>
          0123456789
        </span>
      ) : null}
      {tabularDigits === undefined ? null : (
        <span
          className={`shrink-0 text-[0.6rem] ${tabularDigits ? 'text-emerald-500' : 'text-amber-500'}`}
        >
          {tabularDigits ? 'fixed-width' : 'varying-width'}
        </span>
      )}
    </span>
  )
}
