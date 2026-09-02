import { useEffect, useState } from 'react'
import { Smile } from 'lucide-react'
import { ICON_FAMILY, ICON_GLYPHS, ICON_GROUPS, textFits } from '@shared/icon-glyphs'
import { previewFontFamily, useFontFaceStore } from '@/features/font-library/font-face-store'
import { TextInput } from './fields'
import { PropertyRow, type PropertyMeta } from './PropertyRow'
import { t } from '@shared/ui-text'

function IconGrid({ onPick }: { onPick: (glyph: string) => void }): React.JSX.Element {
  const loaded = useFontFaceStore((state) => state.loaded[ICON_FAMILY])
  const ensureFaces = useFontFaceStore((state) => state.ensureFaces)
  useEffect(() => {
    void ensureFaces([ICON_FAMILY])
  }, [ensureFaces])
  return (
    <div className="absolute right-0 z-30 mt-1 max-h-64 w-60 overflow-y-auto rounded-md border bg-popover p-2 shadow-md">
      {ICON_GROUPS.map((group) => (
        <div key={group} className="mb-2 last:mb-0">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{group}</p>
          <div className="grid grid-cols-8 gap-1">
            {ICON_GLYPHS.filter((icon) => icon.group === group).map((icon) => (
              <button
                key={icon.name}
                type="button"
                title={icon.name}
                aria-label={t('inspector.iconPicker.insertTheNameIcon', { name: icon.name })}
                className="flex size-6 items-center justify-center rounded border text-[9px] text-foreground hover:bg-accent"
                style={loaded ? { fontFamily: previewFontFamily(ICON_FAMILY), fontSize: 15 } : undefined}
                onClick={() => onPick(icon.glyph)}
              >
                {loaded ? icon.glyph : icon.name.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="pt-1 text-[10px] text-muted-foreground">
        {t('inspector.iconPicker.anIconIsAGlyph')}</p>
    </div>
  )
}

export function IconTextInput({
  value,
  capacity,
  onChange,
  placeholder
}: {
  value: string
  capacity: number
  onChange: (value: string) => void
  placeholder?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex items-center gap-1">
      <TextInput value={value} onChange={onChange} placeholder={placeholder} />
      <button
        type="button"
        aria-label={t('inspector.iconPicker.insertAnIcon')}
        title={t('inspector.iconPicker.insertAnIconGlyph')}
        className="flex size-5 flex-none items-center justify-center rounded border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        <Smile aria-hidden className="size-3" />
      </button>
      {open ? (
        <IconGrid
          onPick={(glyph) => {
            setOpen(false)
            const next = value + glyph
            if (textFits(next, capacity)) onChange(next)
          }}
        />
      ) : null}
    </div>
  )
}

export function IconTextField({
  label,
  value,
  capacity,
  onChange,
  placeholder,
  ...meta
}: PropertyMeta & {
  label: string
  value: string
  capacity: number
  onChange: (value: string) => void
  placeholder?: string
}): React.JSX.Element {
  return (
    <PropertyRow label={label} {...meta}>
      <IconTextInput value={value} capacity={capacity} onChange={onChange} placeholder={placeholder} />
    </PropertyRow>
  )
}
