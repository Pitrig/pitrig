import type { FontLibraryEntry } from '@shared/font-library'

import { Badge } from '@/components/ui/badge'
import { DigitSpecimen } from './DigitSpecimen'
import { previewFontFamily } from './font-face-store'
import { kilobytes } from './font-library-store'

const ORIGIN_LABELS: Readonly<Record<FontLibraryEntry['origin'], string>> = {
  bundled: 'Bundled',
  imported: 'Imported',
  google: 'Google Fonts'
}

export function FontPickerRow({
  entry,
  selected,
  disabledReason,
  loaded,
  onChoose
}: {
  entry: FontLibraryEntry
  selected: boolean
  disabledReason?: string
  loaded: boolean
  onChoose: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={Boolean(disabledReason)}
      title={disabledReason}
      onClick={onChoose}
      className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
        selected ? 'border-primary bg-muted' : 'hover:bg-muted'
      } ${disabledReason ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-base leading-tight text-foreground"
          style={loaded ? { fontFamily: previewFontFamily(entry.id) } : undefined}
        >
          {entry.name}
        </span>
        <DigitSpecimen
          cssFamily={loaded ? previewFontFamily(entry.id) : undefined}
          tabularDigits={entry.tabularDigits}
        />
        <span className="block truncate text-[0.65rem] text-muted-foreground">{entry.id}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {entry.bytes > 0 ? (
          <span className="text-[0.65rem] text-muted-foreground">{kilobytes(entry.bytes)}</span>
        ) : null}
        <Badge variant="outline" className="text-[0.65rem]">
          {ORIGIN_LABELS[entry.origin]}
        </Badge>
      </span>
    </button>
  )
}
