import { useState } from 'react'
import type { FontSpec } from '@shared/configuration-schema'
import { MAXIMUM_FONT_SIZE_PX } from '@shared/font-assets'
import { authored } from './authored'
import { PropertyRow } from './PropertyRow'
import { draftFontFamily, useDashboardEditorStore } from '../dashboard-editor'
import { useDeviceStore } from '@/features/device/device-store'
import { FontPicker } from '@/features/font-library/FontPicker'
import { previewFontFamily, useFontFaceStore } from '@/features/font-library/font-face-store'
import { findFontEntry, useFontLibraryStore } from '@/features/font-library/font-library-store'

import { NumberInput } from './fields'

export function FontFamilyPicker({ family, onChange }: { family?: string; onChange: (family: string) => void }): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const entries = useFontLibraryStore((state) => state.entries)
  const loaded = useFontFaceStore((state) => state.loaded)
  const entry = findFontEntry(entries, family)
  return (
    <>
      <button
        type="button"
        onClick={() => setPicking(true)}
        className={`flex h-7 w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-background px-2 text-left ${entry ? 'text-foreground' : 'text-amber-500'}`}
        title={entry ? entry.id : family}
      >
        <span
          className="min-w-0 flex-1 truncate"
          style={family && loaded[family] ? { fontFamily: previewFontFamily(family) } : undefined}
        >
          {entry ? entry.name : family ? `Unresolved: ${family}` : 'Choose font…'}
        </span>
        <BrowseIcon />
      </button>
      {picking ? (
        <FontPicker
          value={family}
          onChoose={(chosen) => { onChange(chosen); setPicking(false) }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  )
}

export function FontFamilyField({ label = 'Font', family, onChange, hint }: { label?: string; family?: string; onChange: (family: string) => void; hint?: string }): React.JSX.Element {
  return (
    <PropertyRow label={label} hint={hint}>
      <FontFamilyPicker family={family} onChange={onChange} />
    </PropertyRow>
  )
}

function BrowseIcon(): React.JSX.Element {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2 13.5 13.5" />
    </svg>
  )
}

export function FontEditor({ font, defaultSizePx, onChange, hint }: { font?: FontSpec; defaultSizePx: number; onChange: (font: FontSpec) => void; hint?: string }): React.JSX.Element {
  const family = draftFontFamily(
    useDeviceStore((state) => state.draft),
    useDashboardEditorStore((state) => state.defaultFontFamily)
  )
  return (
    <PropertyRow
      label="Font"
      hint={hint}
      modified={authored(font?.family, family) || authored(font?.size_px, defaultSizePx)}
      onReset={() => onChange({ family, size_px: defaultSizePx })}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-1">
        <FontFamilyPicker family={font?.family} onChange={(family) => onChange({ ...font, family })} />
        <NumberInput title="Size in pixels" value={font?.size_px ?? defaultSizePx} min={1} max={MAXIMUM_FONT_SIZE_PX} onChange={(size_px) => onChange({ ...font, size_px })} />
      </div>
    </PropertyRow>
  )
}
