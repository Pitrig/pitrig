import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

import {
  MAXIMUM_LED_EFFECTS,
  MAXIMUM_LED_PARTS,
  type HardwareDeviceConfiguration,
  type LedPart
} from '@shared/configuration-schema'
import {
  coversWhole,
  formatLamps,
  mirroredParts,
  parseLamps,
  wholeRun
} from '@shared/led-parts'
import { drawnSize, isMatrix, lampsOf, segmentBoundsOf, shapeOf } from '@shared/led-render'
import { CONTROL, Hint } from '@/features/configuration/inspector/fields'
import { AddButton } from '@/features/configuration/inspector/widget-editors'
import { addProfile, profileFits } from './modules-document'
import { useModulesStore } from './modules-store'
import { area } from './profile-types'
import { LED_PROFILES, type LedProfile } from './profiles'
import { t } from '@shared/ui-text'

const CUSTOM_LAYER = { type: 'solid', color: '#38BDF8' } as const

const CUSTOM: LedProfile = {
  id: 'custom',
  label: t('modules.profilePicker.customLayer'),
  description: t('modules.profilePicker.aBlankLayerWithEvery'),
  build: (zone) => ({ effects: [{ ...CUSTOM_LAYER, ...area(zone) }] })
}

interface PickerProps {
  output: number
  device: HardwareDeviceConfiguration
}

export function ProfilePicker(props: PickerProps): React.JSX.Element {
  return <Picker key={props.output} {...props} />
}

function Picker({ output, device }: PickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<LedProfile | null>(null)
  const [typed, setTyped] = useState<string | undefined>()
  const lampZone = useModulesStore((state) => state.zone)
  const setZone = useModulesStore((state) => state.setZone)
  const selectEffect = useModulesStore((state) => state.selectEffect)
  const zone = lampZone?.output === output ? lampZone.parts : undefined

  const lamps = lampsOf(device)
  const used = (device.effects ?? []).length
  const ranged = !isMatrix(device) && lamps > 1
  const bounds = segmentBoundsOf(device)
  const shape = shapeOf(device)
  const panel = shape ? drawnSize(shape) : undefined

  useEffect(() => () => setZone(null), [setZone])

  const close = (): void => {
    setOpen(false)
    setChosen(null)
    setZone(null)
  }

  const insert = (profile: LedProfile, picked: LedPart[] | undefined): void => {
    const covered = (picked ?? wholeRun(lamps)).reduce((total, part) => total + (part.count ?? 1), 0)
    const whole = !picked || coversWhole(picked, lamps)
    addProfile(output, profile.build(whole ? undefined : picked, covered, panel))
    selectEffect(used)
    close()
  }

  const choose = (next: LedPart[] | undefined): void => {
    setZone({ output, ...(next && !coversWhole(next, lamps) ? { parts: next } : {}), touched: true })
  }

  const pick = (profile: LedProfile): void => {
    if (!ranged) {
      insert(profile, undefined)
      return
    }
    setChosen(profile)
    setTyped(undefined)
    setZone({ output, touched: false })
  }

  const shown = formatLamps(zone ?? wholeRun(lamps))
  const invalid = typed !== undefined && parseLamps(typed, lamps) === undefined

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
            const parts = profile.build(undefined, lamps, panel)
            const fits =
              used + parts.effects.length <= MAXIMUM_LED_EFFECTS && profileFits(device, parts)
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
            onClick={() => pick(CUSTOM)}
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
            <input
              className={`${CONTROL} ${invalid ? 'border-red-500/60' : ''}`}
              aria-label={t('modules.outputEditor.lamps')}
              value={typed ?? shown}
              onChange={(event) => {
                setTyped(event.target.value)
                const next = parseLamps(event.target.value, lamps)
                if (next) choose(next)
              }}
              onBlur={() => setTyped(undefined)}
            />
          </div>
          {invalid ? (
            <p className="pb-1 text-[10px] text-red-300">
              {t('modules.lampsField.writeLampsLike', { lamps, parts: MAXIMUM_LED_PARTS })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1 pb-1">
            {bounds.map((run, index) => (
              <button
                key={index}
                type="button"
                className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] hover:bg-white/5"
                onClick={() => {
                  setTyped(undefined)
                  choose([{ ...(run.start > 0 ? { from: run.start } : {}), count: run.end - run.start + 1 }])
                }}
              >
                {t('modules.profilePicker.runNumberRange', {
                  number: index + 1,
                  from: run.start + 1,
                  to: run.end + 1
                })}
              </button>
            ))}
            <button
              type="button"
              className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] hover:bg-white/5"
              title={t('modules.lampsField.addsTheMirrorImage')}
              onClick={() => {
                setTyped(undefined)
                choose(mirroredParts(zone ?? wholeRun(lamps), lamps))
              }}
            >
              {t('modules.lampsField.mirror')}
            </button>
          </div>
          <Hint>{t('modules.profilePicker.theCoveredLampsGlowIn')}</Hint>
          <div className="flex gap-1 pt-1">
            <button
              type="button"
              className="rounded border border-sky-500/50 bg-sky-500/10 px-2 py-1 text-xs hover:bg-sky-500/20"
              onClick={() => insert(chosen, zone)}
            >
              {t('modules.profilePicker.addToThisDevice')}</button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs hover:bg-white/5"
              onClick={() => {
                setChosen(null)
                setZone(null)
              }}
            >
              {t('templates.insertScreenDialog.back')}</button>
          </div>
        </>
      )}
    </div>
  )
}
