import {
  LED_ANIMATION_KIND_VALUES,
  LED_EFFECT_TYPE_VALUES,
  LED_FONT_VALUES,
  type HardwareDeviceConfiguration,
  type LedEffect
} from '@shared/configuration-schema'
import { LED_EFFECT_READS_VALUE, LED_EFFECT_USES_RANGE } from '@shared/led-render'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { fieldBounds } from '@shared/validate/ranges'
import { SlidersHorizontal } from 'lucide-react'

import { authored } from '@/features/configuration/inspector/authored'
import { Group } from '@/features/configuration/inspector/Group'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import { TelemetryBindingField } from '@/features/configuration/inspector/TelemetryBindingField'
import { RangeRow } from '@/features/configuration/inspector/section-editors'
import {
  CheckboxField,
  ColorField,
  NumberField,
  NumberInput,
  SelectField,
  TextField
} from '@/features/configuration/inspector/fields'
import {
  applyDirection,
  directionOf,
  LAYER_DIRECTIONS,
  LED_EFFECT_USES_DIRECTION
} from './direction'
import { t } from '@shared/ui-text'
import { layerName } from './layer-name'
import { PanelAreaField } from './PanelArea'
import { mutateEffects } from './modules-document'
import { EffectColors } from './effect-colors'
import { EffectGate } from './effect-gate'
import { EffectPayload } from './effect-payload'

export function EffectEditor({
  output,
  device,
  index
}: {
  output: number
  device: HardwareDeviceConfiguration
  index: number
}): React.JSX.Element | null {
  const effect = (device.effects ?? [])[index]
  if (!effect) return null
  const type = effect.type ?? 'solid'
  const matrix = device.type === 'rgb_matrix'
  const pictures = (device.sprites ?? []).map((sprite) => sprite.id ?? '')
  const offered = LED_EFFECT_TYPE_VALUES.filter(
    (value) =>
      value === type ||
      (value === 'sprite'
        ? matrix && pictures.length > 0
        : matrix || value !== 'text')
  )
  const update = (mutation: (next: LedEffect) => void): void =>
    mutateEffects(output, (effects) => {
      const next = structuredClone(effects[index] as LedEffect)
      mutation(next)
      effects[index] = next
    })

  return (
    <>
      <Group
        id="LedLayer"
        title={layerName(effect, index)}
        icon={SlidersHorizontal}
        summary={type}
        defaultOpen
      >
        <SelectField
          label={t('modules.effectEditor.paints')}
          hint={t('modules.hints.effect.type')}
          value={type}
          options={offered}
          modified={authored(effect.type, 'solid')}
          onChange={(value) => update((next) => {
            next.type = value
            if (!LED_EFFECT_READS_VALUE.has(value)) {
              delete next.source
              delete next.minimum
              delete next.maximum
            }
          })}
        />
        <TextField
          label={t('device.infoPage.name')}
          value={effect.id ?? ''}
          onChange={(id) => update((next) => { if (id) next.id = id; else delete next.id })}
        />
        {matrix ? (
          <PanelAreaField device={device} effect={effect} update={update} />
        ) : (
        <PropertyRow label={t('modules.effectEditor.area')} hint={t('modules.hints.effect.area')}>
          <div className="grid grid-cols-2 gap-1">
            <NumberInput
              title={t('modules.effectEditor.firstLampOfThisDevice')}
              value={(effect.from ?? 0) + 1}
              min={1}
              onChange={(from) => update((next) => { next.from = Math.max(0, from - 1) })}
            />
            <NumberInput
              title={t('modules.effectEditor.lampsCovered0CoversThe')}
              value={effect.count ?? 0}
              min={0}
              onChange={(count) => update((next) => { next.count = count })}
            />
          </div>
          <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground">
            <span>{t('modules.effectEditor.from')}</span>
            <span>{t('modules.effectEditor.count')}</span>
          </div>
        </PropertyRow>
        )}
        {LED_EFFECT_READS_VALUE.has(type) ? (
          <TelemetryBindingField
            value={effect.source?.binding ?? ''}
            onChange={(binding) =>
              update((next) => {
                if (binding) next.source = { ...next.source, binding }
                else delete next.source
              })
            }
          />
        ) : null}
        {LED_EFFECT_USES_RANGE.has(type) ? (
          <RangeRow
            widget={effect}
            update={update}
            unit={(() => {
              const binding = TELEMETRY_CATALOG.find(
                ({ name }) => name === effect.source?.binding
              )
              return binding?.unit && binding.unit !== 'source' ? ` (${binding.unit})` : ''
            })()}
          />
        ) : null}
        {type === 'solid' || type === 'animation' || type === 'gauge' || type === 'text' ? (
          <ColorField
            label={t('modules.effectEditor.colour')}
            value={effect.color ?? '#ffffff'}
            modified={authored(effect.color, '#ffffff')}
            onChange={(color) => update((next) => { next.color = color })}
          />
        ) : null}
        {type === 'sprite' ? (
          <>
            <SelectField
              label={t('modules.effectEditor.picture')}
              hint={t('modules.hints.effect.sprite')}
              value={effect.sprite ?? ''}
              options={effect.sprite && !pictures.includes(effect.sprite)
                ? [effect.sprite, ...pictures]
                : ['', ...pictures]}
              onChange={(sprite) => update((next) => {
                if (sprite) next.sprite = sprite
                else delete next.sprite
              })}
            />
            <CheckboxField
              label={t('modules.effectEditor.playFrames')}
              hint={t('modules.hints.effect.loop')}
              checked={effect.sprite_loop ?? false}
              modified={authored(effect.sprite_loop, false)}
              onChange={(checked) => update((next) => {
                if (checked) next.sprite_loop = true
                else delete next.sprite_loop
              })}
            />
            {effect.sprite_loop ? (
              <NumberField
                label={t('modules.effectEditor.frameHolds')}
                suffix="ms"
                value={effect.speed_ms ?? 1000}
                {...fieldBounds('LedEffect', 'speed_ms')}
                onChange={(value) => update((next) => { next.speed_ms = value })}
              />
            ) : (
              <NumberField
                label={t('modules.effectEditor.frame')}
                hint={t('modules.effectEditor.whichFrameToHoldStill')}
                value={effect.sprite_frame ?? 0}
                {...fieldBounds('LedEffect', 'sprite_frame')}
                onChange={(value) => update((next) => { next.sprite_frame = value })}
              />
            )}
          </>
        ) : null}
        {type === 'text' ? (
          <>
            <TextField
              label={t('modules.effectEditor.text')}
              hint={t('modules.effectEditor.drawnAsAuthoredWithA')}
              value={effect.text ?? ''}
              onChange={(value) => update((next) => {
                if (value) next.text = value
                else delete next.text
              })}
            />
            <SelectField
              label={t('modules.effectEditor.face')}
              value={effect.font ?? 'regular_4x6'}
              options={LED_FONT_VALUES}
              onChange={(font) => update((next) => { next.font = font })}
            />
            <NumberField
              label={t('modules.effectEditor.scrollStep')}
              suffix="ms"
              hint={t('modules.effectEditor.howLongOneColumnOf')}
              value={effect.speed_ms ?? 1000}
              {...fieldBounds('LedEffect', 'speed_ms')}
              onChange={(value) => update((next) => { next.speed_ms = value })}
            />
          </>
        ) : null}
        {type === 'animation' ? (
          <>
            <SelectField
              label={t('modules.effectEditor.motion')}
              value={effect.animation ?? 'rainbow'}
              options={LED_ANIMATION_KIND_VALUES}
              onChange={(value) => update((next) => { next.animation = value })}
            />
            <NumberField
              label={t('modules.effectEditor.pass')}
              suffix="ms"
              value={effect.speed_ms ?? 1000}
              {...fieldBounds('LedEffect', 'speed_ms')}
              onChange={(speed_ms) => update((next) => { next.speed_ms = speed_ms })}
            />
          </>
        ) : null}
        {LED_EFFECT_USES_DIRECTION.has(type) ? (
          <SelectField
            label={t('modules.effectEditor.direction')}
            hint={t('modules.hints.effect.shape')}
            value={directionOf(effect)}
            options={LAYER_DIRECTIONS}
            modified={directionOf(effect) !== 'along the run'}
            onChange={(direction) => update((next) => applyDirection(next, direction))}
          />
        ) : null}
        <EffectPayload effect={effect} type={type} update={update} />
        <EffectGate effect={effect} update={update} />
        <EffectColors effect={effect} update={update} />
      </Group>
    </>
  )
}
