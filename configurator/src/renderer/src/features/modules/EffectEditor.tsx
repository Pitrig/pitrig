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
import { HINTS } from './hints'
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
          label="Paints"
          hint={HINTS.effect.type}
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
          label="Name"
          value={effect.id ?? ''}
          onChange={(id) => update((next) => { if (id) next.id = id; else delete next.id })}
        />
        {matrix ? (
          <PanelAreaField device={device} effect={effect} update={update} />
        ) : (
        <PropertyRow label="Area" hint={HINTS.effect.area}>
          <div className="grid grid-cols-2 gap-1">
            <NumberInput
              title="First lamp of this device, counted from 1"
              value={(effect.from ?? 0) + 1}
              min={1}
              onChange={(from) => update((next) => { next.from = Math.max(0, from - 1) })}
            />
            <NumberInput
              title="Lamps covered; 0 covers the rest"
              value={effect.count ?? 0}
              min={0}
              onChange={(count) => update((next) => { next.count = count })}
            />
          </div>
          <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground">
            <span>From</span>
            <span>Count</span>
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
            label="Colour"
            value={effect.color ?? '#ffffff'}
            modified={authored(effect.color, '#ffffff')}
            onChange={(color) => update((next) => { next.color = color })}
          />
        ) : null}
        {type === 'sprite' ? (
          <>
            <SelectField
              label="Picture"
              hint={HINTS.effect.sprite}
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
              label="Play frames"
              hint={HINTS.effect.loop}
              checked={effect.sprite_loop ?? false}
              modified={authored(effect.sprite_loop, false)}
              onChange={(checked) => update((next) => {
                if (checked) next.sprite_loop = true
                else delete next.sprite_loop
              })}
            />
            {effect.sprite_loop ? (
              <NumberField
                label="Frame holds"
                suffix="ms"
                value={effect.speed_ms ?? 1000}
                {...fieldBounds('LedEffect', 'speed_ms')}
                onChange={(value) => update((next) => { next.speed_ms = value })}
              />
            ) : (
              <NumberField
                label="Frame"
                hint="Which frame to hold still. With telemetry bound the value picks it instead."
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
              label="Text"
              hint="Drawn as authored. With a source bound this becomes the prefix and the source supplies the rest."
              value={effect.text ?? ''}
              onChange={(value) => update((next) => {
                if (value) next.text = value
                else delete next.text
              })}
            />
            <SelectField
              label="Face"
              value={effect.font ?? 'regular_4x6'}
              options={LED_FONT_VALUES}
              onChange={(font) => update((next) => { next.font = font })}
            />
            <NumberField
              label="Scroll step"
              suffix="ms"
              hint="How long one column of a scrolling string stays put. Text that fits the panel is centred and does not scroll."
              value={effect.speed_ms ?? 1000}
              {...fieldBounds('LedEffect', 'speed_ms')}
              onChange={(value) => update((next) => { next.speed_ms = value })}
            />
          </>
        ) : null}
        {type === 'animation' ? (
          <>
            <SelectField
              label="Motion"
              value={effect.animation ?? 'rainbow'}
              options={LED_ANIMATION_KIND_VALUES}
              onChange={(value) => update((next) => { next.animation = value })}
            />
            <NumberField
              label="Pass"
              suffix="ms"
              value={effect.speed_ms ?? 1000}
              {...fieldBounds('LedEffect', 'speed_ms')}
              onChange={(speed_ms) => update((next) => { next.speed_ms = speed_ms })}
            />
          </>
        ) : null}
        {LED_EFFECT_USES_DIRECTION.has(type) ? (
          <SelectField
            label="Direction"
            hint={HINTS.effect.shape}
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
