import { useEffect, useRef } from 'react'

import type { FontCatalogFamily, FontVariant } from '@shared/font-library'
import { t } from '@shared/ui-text'

import { Badge } from '@/components/ui/badge'
import { FaceSpecimen } from './FaceSpecimen'
import { variantLabel } from './font-catalog-store'

const DWELL_MS = 150

export function FontCatalogRow({
  family,
  previewFamily,
  tabularDigits,
  unavailable,
  expanded,
  disabledReason,
  onVisible,
  onToggle,
  onChoose
}: {
  family: FontCatalogFamily
  previewFamily?: string
  tabularDigits?: boolean
  unavailable: boolean
  expanded: boolean
  disabledReason?: string
  onVisible: () => void
  onToggle: () => void
  onChoose: (variant: FontVariant) => void
}): React.JSX.Element {
  const row = useRef<HTMLDivElement>(null)
  const dwell = useRef<number | undefined>(undefined)

  useEffect(() => {
    const element = row.current
    if (!element) return
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting)
      if (!visible) {
        window.clearTimeout(dwell.current)
        dwell.current = undefined
        return
      }
      dwell.current = window.setTimeout(onVisible, DWELL_MS)
    })
    observer.observe(element)
    return () => {
      window.clearTimeout(dwell.current)
      observer.disconnect()
    }
  }, [onVisible])

  return (
    <div ref={row} className="rounded-md border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
      >
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-base leading-tight text-foreground"
            style={previewFamily ? { fontFamily: previewFamily } : undefined}
          >
            {family.name}
          </span>
          <FaceSpecimen cssFamily={previewFamily} tabularDigits={tabularDigits} />
          <span className="block truncate text-[0.65rem] text-muted-foreground">
            {family.category}
            {unavailable ? t('fonts.fontCatalogRow.previewUnavailable') : ''}
          </span>
        </span>
        <Badge variant="outline" className="shrink-0 text-[0.65rem]">
          {t('fonts.catalog.weightCount', { count: family.variants.length })}
        </Badge>
      </button>
      {expanded ? (
        <div className="flex flex-wrap gap-1 border-t p-2">
          {family.variants.map((variant) => (
            <button
              key={variant}
              type="button"
              disabled={Boolean(disabledReason)}
              title={disabledReason}
              onClick={() => onChoose(variant)}
              className={`rounded-md border px-2 py-1 text-[0.65rem] ${
                disabledReason ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted'
              }`}
            >
              {variantLabel(variant)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
