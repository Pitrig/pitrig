import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import {
  MAXIMUM_LED_PARTS,
  type HardwareDeviceConfiguration,
  type LedPart,
  type LedPartLayout
} from '@shared/configuration-schema'
import { formatLamps, mirroredParts, parseLamps, partEnd, wholeRun } from '@shared/led-parts'
import { lampsOf, segmentBoundsOf } from '@shared/led-render'
import { CONTROL } from '@/features/configuration/inspector/fields'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { Select } from '@/components/ui/select'
import { t } from '@shared/ui-text'

const CHIP = 'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] hover:bg-white/5'
const JOINED: LedPartLayout = 'joined'

export function LampsField({
  device,
  parts,
  layout,
  mixed,
  onParts,
  onLayout
}: {
  device: HardwareDeviceConfiguration
  parts: readonly LedPart[] | undefined
  layout?: LedPartLayout
  mixed?: boolean
  onParts: (parts: LedPart[] | undefined) => void
  onLayout: (layout: LedPartLayout) => void
}): React.JSX.Element {
  const lamps = lampsOf(device)
  const current = parts && parts.length > 0 ? parts : wholeRun(lamps)
  const shown = parts && parts.length > 0 ? formatLamps(parts) : formatLamps(wholeRun(lamps))
  const [typed, setTyped] = useState<string | undefined>()
  const invalid = typed !== undefined && parseLamps(typed, lamps) === undefined
  const runs = segmentBoundsOf(device)
  const label = mixed
    ? t('modules.multiEffectEditor.labelMixed', { label: t('modules.lampsField.lamps') })
    : t('modules.lampsField.lamps')

  const flip = (at: number): void =>
    onParts(current.map((part, index) => (index === at ? { ...part, reversed: !part.reversed } : part)))

  return (
    <>
      <PropertyRow label={label} hint={t('modules.hints.effect.lamps')}>
        <input
          className={`${CONTROL} ${invalid ? 'border-red-500/60' : ''}`}
          aria-label={t('modules.lampsField.lamps')}
          value={typed ?? shown}
          onChange={(event) => {
            const text = event.target.value
            setTyped(text)
            const next = parseLamps(text, lamps)
            if (next) onParts(next)
          }}
          onBlur={() => setTyped(undefined)}
        />
        {invalid ? (
          <p className="pt-0.5 text-[10px] text-red-300">
            {t('modules.lampsField.writeLampsLike', { lamps, parts: MAXIMUM_LED_PARTS })}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1 pt-1">
          {current.map((part, index) => (
            <button
              key={`${part.from ?? 0}-${index}`}
              type="button"
              className={CHIP}
              title={t('modules.lampsField.clickToRunThisPart')}
              onClick={() => flip(index)}
            >
              {part.reversed ? `${partEnd(part) + 1}–${(part.from ?? 0) + 1}` : `${(part.from ?? 0) + 1}–${partEnd(part) + 1}`}
              {part.reversed ? <ArrowLeft className="size-3" /> : <ArrowRight className="size-3" />}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          <button type="button" className={CHIP} onClick={() => onParts(undefined)}>
            {t('modules.lampsField.wholeStrip')}
          </button>
          {runs.map((run, index) => (
            <button
              key={index}
              type="button"
              className={CHIP}
              onClick={() => onParts([{ ...(run.start > 0 ? { from: run.start } : {}), count: run.end - run.start + 1 }])}
            >
              {t('modules.profilePicker.runNumberRange', { number: index + 1, from: run.start + 1, to: run.end + 1 })}
            </button>
          ))}
          <button
            type="button"
            className={CHIP}
            title={t('modules.lampsField.addsTheMirrorImage')}
            onClick={() => onParts(mirroredParts(current, lamps))}
          >
            {t('modules.lampsField.mirror')}
          </button>
        </div>
      </PropertyRow>
      {current.length > 1 ? (
        <PropertyRow label={t('modules.lampsField.spread')} hint={t('modules.hints.effect.spread')}>
          <Select
            className={CONTROL}
            value={layout ?? JOINED}
            options={[
              { value: 'joined' as const, label: t('modules.lampsField.asOneLine') },
              { value: 'each' as const, label: t('modules.lampsField.eachPartOnItsOwn') }
            ]}
            onChange={onLayout}
          />
        </PropertyRow>
      ) : null}
    </>
  )
}
