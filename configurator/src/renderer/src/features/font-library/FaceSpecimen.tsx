import { ICON_SPECIMEN } from './icon-face'
import { t } from '@shared/ui-text'

export function FaceSpecimen({
  cssFamily,
  tabularDigits,
  icons
}: {
  cssFamily?: string
  tabularDigits?: boolean
  icons?: boolean
}): React.JSX.Element | null {
  if (icons) {
    if (!cssFamily) return null
    return (
      <span
        className="flex items-center gap-1.5 truncate text-[0.95rem] leading-none"
        style={{ fontFamily: cssFamily }}
      >
        {ICON_SPECIMEN}
      </span>
    )
  }
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
          {tabularDigits ? t('fonts.faceSpecimen.fixedWidth') : t('fonts.faceSpecimen.varyingWidth')}
        </span>
      )}
    </span>
  )
}
