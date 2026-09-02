import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

import { MAXIMUM_LED_EFFECTS, type HardwareDeviceConfiguration } from '@shared/configuration-schema'
import { drawnSize, isMatrix, lampsOf, segmentBoundsOf, shapeOf } from '@shared/led-render'
import { Hint, NumberInput } from '@/features/configuration/inspector/fields'
import { AddButton } from '@/features/configuration/inspector/widget-editors'
import { addProfile, mutateEffects } from './modules-document'
import { useModulesStore } from './modules-store'
import { LED_PROFILES, type LampRange, type LedProfile } from './profiles'
import { t } from '@shared/ui-text'

const CUSTOM_LAYER = { type: 'solid', color: '#38BDF8' } as const

export function ProfilePicker({
  output,
  device
}: {
  output: number
  device: HardwareDeviceConfiguration
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<LedProfile | null>(null)
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(0)
  const setHighlight = useModulesStore((state) => state.setHighlight)
  const selectEffect = useModulesStore((state) => state.selectEffect)

  const lamps = lampsOf(device)
  const used = (device.effects ?? []).length
  const ranged = !isMatrix(device) && lamps > 1
  const bounds = segmentBoundsOf(device)
  const shape = shapeOf(device)
  const panel = shape ? drawnSize(shape) : undefined

  useEffect(() => () => setHighlight(null), [setHighlight])

  const close = (): void => {
    setOpen(false)
    setChosen(null)
    setHighlight(null)
  }

  const insert = (profile: LedProfile, range: LampRange): void => {
    const parts = profile.build(
      range,
      range.count > 0 ? range.count : lamps - range.from,
      panel
    )
    addProfile(output, parts)
    selectEffect(used)
    close()
  }

  const highlight = (first: number, last: number): void => {
    setHighlight({ output, from: first, count: last - first + 1 })
  }

  const pick = (profile: LedProfile): void => {
    if (!ranged) {
      insert(profile, { from: 0, count: 0 })
      return
    }
    setChosen(profile)
    setFrom(0)
    setTo(lamps - 1)
    highlight(0, lamps - 1)
  }

  const rangeOf = (): LampRange =>
    from === 0 && to === lamps - 1 ? { from: 0, count: 0 } : { from, count: to - from + 1 }

  if (!open) {
    return <AddButton label={t('modules.profilePicker.addLayer')} onClick={() => setOpen(true)} />
  }

  return (
    <div className="mt-1 rounded border border-white/10 bg-black/20 p-2">
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs font-medium">
          {chosen ? chosen.label : t('modules.profilePicker.whatShouldTheNewLayer')}
        </span>
        <button
          type="button"
          aria-label={t('modules.profilePicker.closeTheLayerPicker')}
          className="rounded p-1 text-muted-foreground hover:bg-white/5"
          onClick={close}
        >
          <X className="size-3.5" />
        </button>
      </div>
      {chosen === null ? (
        <div className="grid grid-cols-2 gap-1">
          {LED_PROFILES.filter((profile) => panel !== undefined || !profile.panelOnly).map((profile) => {
            const layers = profile.build({ from: 0, count: 0 }, lamps, panel).effects.length
            const fits = used + layers <= MAXIMUM_LED_EFFECTS
            return (
              <button
                key={profile.id}
                type="button"
                disabled={!fits}
                className="rounded border border-white/10 p-2 text-left hover:bg-white/5 disabled:opacity-30"
                onClick={() => pick(profile)}
              >
                <span className="block text-xs font-medium">{profile.label}</span>
                <span className="block pt-0.5 text-[10px] text-muted-foreground">
                  {profile.description}
                </span>
              </button>
            )
          })}
          <button
            type="button"
            disabled={used >= MAXIMUM_LED_EFFECTS}
            className="rounded border border-dashed border-white/20 p-2 text-left hover:bg-white/5 disabled:opacity-30"
            onClick={() => {
              mutateEffects(output, (list) => {
                list.push({ ...CUSTOM_LAYER })
              })
              selectEffect(used)
              close()
            }}
          >
            <span className="block text-xs font-medium">{t('modules.profilePicker.customLayer')}</span>
            <span className="block pt-0.5 text-[10px] text-muted-foreground">
              {t('modules.profilePicker.aBlankLayerWithEvery')}</span>
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 pb-1">
            <span className="text-[11px] text-muted-foreground">{t('modules.outputEditor.lamps')}</span>
            <NumberInput
              title={t('modules.profilePicker.firstLampOfTheProfile')}
              value={from + 1}
              min={1}
              max={to + 1}
              onChange={(value) => {
                const first = Math.max(0, Math.min(value - 1, to))
                setFrom(first)
                highlight(first, to)
              }}
            />
            <span className="text-[11px] text-muted-foreground">{t('modules.profilePicker.to')}</span>
            <NumberInput
              title={t('modules.profilePicker.lastLampOfTheProfile')}
              value={to + 1}
              min={from + 1}
              max={lamps}
              onChange={(value) => {
                const last = Math.max(from, Math.min(value - 1, lamps - 1))
                setTo(last)
                highlight(from, last)
              }}
            />
          </div>
          {bounds.length > 0 ? (
            <div className="flex flex-wrap gap-1 pb-1">
              {bounds.map((run, index) => (
                <button
                  key={index}
                  type="button"
                  className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] hover:bg-white/5"
                  onClick={() => {
                    setFrom(run.start)
                    setTo(run.end)
                    highlight(run.start, run.end)
                  }}
                >
                  {`Run ${index + 1} · ${run.start + 1}–${run.end + 1}`}
                </button>
              ))}
            </div>
          ) : null}
          <Hint>{t('modules.profilePicker.theCoveredLampsGlowIn')}</Hint>
          <div className="flex gap-1 pt-1">
            <button
              type="button"
              className="rounded border border-sky-500/50 bg-sky-500/10 px-2 py-1 text-xs hover:bg-sky-500/20"
              onClick={() => insert(chosen, rangeOf())}
            >
              {t('modules.profilePicker.addToThisDevice')}</button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs hover:bg-white/5"
              onClick={() => {
                setChosen(null)
                setHighlight(null)
              }}
            >
              {t('templates.insertScreenDialog.back')}</button>
          </div>
        </>
      )}
    </div>
  )
}
