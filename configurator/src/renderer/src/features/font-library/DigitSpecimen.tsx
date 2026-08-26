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
