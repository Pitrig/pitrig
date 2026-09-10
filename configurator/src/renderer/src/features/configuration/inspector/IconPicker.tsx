import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Smile } from 'lucide-react'
import { ICON_FAMILY, ICON_GLYPHS, ICON_GROUPS, textFits } from '@shared/icon-glyphs'
import { glyphFontFamily, previewFontFamily, useFontFaceStore } from '@/features/font-library/font-face-store'
import { searchIcons, useIconCatalogStore } from '@/features/font-library/icon-catalog-store'
import type { IconName } from '@/features/font-library/icon-ligatures'
import { TextInput } from './fields'
import { PropertyRow, type PropertyMeta } from './PropertyRow'
import { usePopoverAnchor } from './popover-anchor'
import { t } from '@shared/ui-text'

const GRID_WIDTH_PX = 240
const GRID_HEIGHT_PX = 288
const SEARCH_RESULT_LIMIT = 120
const GLYPH_TEXT_FAMILY = `${glyphFontFamily(ICON_FAMILY)}, var(--font-sans)`

interface IconChoice {
  loaded: boolean
  onPick: (glyph: string) => void
}

function IconButton({ icon, loaded, onPick }: IconChoice & { icon: IconName }): React.JSX.Element {
  return (
    <button
      type="button"
      title={icon.name}
      aria-label={t('inspector.iconPicker.insertTheNameIcon', { name: icon.name })}
      className="flex size-6 items-center justify-center rounded border text-[9px] text-foreground hover:bg-accent"
      style={loaded ? { fontFamily: previewFontFamily(ICON_FAMILY), fontSize: 15 } : undefined}
      onClick={() => onPick(icon.glyph)}
    >
      {loaded ? icon.glyph : icon.name.slice(0, 2)}
    </button>
  )
}

function IconGroups(choice: IconChoice): React.JSX.Element {
  return (
    <>
      {ICON_GROUPS.map((group) => (
        <div key={group} className="mb-2 last:mb-0">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{group}</p>
          <div className="grid grid-cols-8 gap-1">
            {ICON_GLYPHS.filter((icon) => icon.group === group).map((icon) => (
              <IconButton key={icon.name} icon={icon} {...choice} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function IconSearchResults({ query, ...choice }: IconChoice & { query: string }): React.JSX.Element {
  const icons = useIconCatalogStore((state) => state.icons)
  const matches = useMemo(() => searchIcons(icons, query), [icons, query])
  if (matches.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground">
        {t('inspector.iconPicker.nothingMatches', { query: query.trim() })}
      </p>
    )
  }
  return (
    <>
      <div className="grid grid-cols-8 gap-1">
        {matches.slice(0, SEARCH_RESULT_LIMIT).map((icon) => (
          <IconButton key={icon.glyph} icon={icon} {...choice} />
        ))}
      </div>
      {matches.length > SEARCH_RESULT_LIMIT ? (
        <p className="pt-1 text-[10px] text-muted-foreground">
          {t('inspector.iconPicker.firstShownOfTotal', { shown: SEARCH_RESULT_LIMIT, total: matches.length })}
        </p>
      ) : null}
    </>
  )
}

function IconPanel(choice: IconChoice): React.JSX.Element {
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const load = useIconCatalogStore((state) => state.load)
  useEffect(() => {
    search.current?.focus()
    void load()
  }, [load])
  return (
    <>
      <input
        ref={search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('inspector.iconPicker.searchAllIcons')}
        aria-label={t('inspector.iconPicker.searchAllIcons')}
        className="mb-2 h-6 w-full flex-none rounded border bg-background px-1.5 text-xs text-foreground"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.trim() ? <IconSearchResults query={query} {...choice} /> : <IconGroups {...choice} />}
        <p className="pt-1 text-[10px] text-muted-foreground">
          {t('inspector.iconPicker.anIconIsAGlyph')}</p>
      </div>
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
              className="fixed z-50 flex flex-col rounded-md border bg-popover p-2 shadow-md"
              style={{
                left: anchor.left,
                top: anchor.top,
                bottom: anchor.bottom,
                width: GRID_WIDTH_PX,
                maxHeight: Math.min(anchor.maxHeight, GRID_HEIGHT_PX)
              }}
            >
              <IconPanel
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
