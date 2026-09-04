import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Smile } from 'lucide-react'
import { ICON_FAMILY, ICON_GLYPHS, ICON_GROUPS, textFits } from '@shared/icon-glyphs'
import { glyphFontFamily, previewFontFamily, useFontFaceStore } from '@/features/font-library/font-face-store'
import { TextInput } from './fields'
import { PropertyRow, type PropertyMeta } from './PropertyRow'
import { usePopoverAnchor } from './popover-anchor'
import { t } from '@shared/ui-text'

const GRID_WIDTH_PX = 240
const GRID_HEIGHT_PX = 288
const GLYPH_TEXT_FAMILY = `${glyphFontFamily(ICON_FAMILY)}, var(--font-sans)`

function IconGrid({ loaded, onPick }: { loaded: boolean; onPick: (glyph: string) => void }): React.JSX.Element {
  return (
    <>
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
    </>
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
  const loaded = useFontFaceStore((state) => state.loaded[ICON_FAMILY])
  const ensureFaces = useFontFaceStore((state) => state.ensureFaces)
  const dismiss = useCallback(() => setOpen(false), [])
  const { trigger, popover, anchor } = usePopoverAnchor(open, GRID_WIDTH_PX, dismiss)
  useEffect(() => {
    void ensureFaces([ICON_FAMILY])
  }, [ensureFaces])
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <TextInput value={value} onChange={onChange} placeholder={placeholder} fontFamily={loaded ? GLYPH_TEXT_FAMILY : undefined} />
        <button
          ref={trigger}
          type="button"
          aria-label={t('inspector.iconPicker.insertAnIcon')}
          aria-expanded={open}
          title={t('inspector.iconPicker.insertAnIconGlyph')}
          className="flex size-5 flex-none items-center justify-center rounded border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => setOpen(!open)}
        >
          <Smile aria-hidden className="size-3" />
        </button>
      </div>
      {open && anchor
        ? createPortal(
            <div
              ref={popover}
              role="dialog"
              aria-label={t('inspector.iconPicker.insertAnIcon')}
              className="fixed z-50 overflow-y-auto rounded-md border bg-popover p-2 shadow-md"
              style={{
                left: anchor.left,
                top: anchor.top,
                bottom: anchor.bottom,
                width: GRID_WIDTH_PX,
                maxHeight: Math.min(anchor.maxHeight, GRID_HEIGHT_PX)
              }}
            >
              <IconGrid
                loaded={loaded === true}
                onPick={(glyph) => {
                  setOpen(false)
                  const next = value + glyph
                  if (textFits(next, capacity)) onChange(next)
                }}
              />
            </div>,
            document.body
          )
        : null}
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
