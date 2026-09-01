import { Cable } from 'lucide-react'

import {
  LED_CHIP_VALUES,
  MATRIX_ORDER_VALUES,
  MATRIX_ORIGIN_VALUES,
  type HardwareDeviceConfiguration
} from '@shared/configuration-schema'
import { fieldBounds } from '@shared/validate/ranges'
import { isMatrix, lampsOf } from '@shared/led-render'
import { authored } from '@/features/configuration/inspector/authored'
import { Advanced, Group } from '@/features/configuration/inspector/Group'
import { PropertyRow } from '@/features/configuration/inspector/PropertyRow'
import {
  CheckboxField,
  Hint,
  NumberField,
  NumberInput,
  SelectField,
  SelectInput,
  TextField
} from '@/features/configuration/inspector/fields'
import { HINTS } from './hints'
import { freePins, mutateDevice } from './modules-document'
import type { DeviceConfiguration } from '@shared/device'

const MILLIAMPS_PER_LAMP = 60
const ROTATIONS = ['0', '90', '180', '270'] as const

export function OutputEditor({
  draft,
  index,
  device
}: {
  draft: DeviceConfiguration
  index: number
  device: HardwareDeviceConfiguration
}): React.JSX.Element {
  const pins = freePins(draft, index)
  const choices = [...new Set([...(device.pin === undefined ? [] : [device.pin]), ...pins])]
    .sort((left, right) => left - right)
    .map(String)
  const lamps = lampsOf(device)
  const peak = Math.round((lamps * MILLIAMPS_PER_LAMP * (device.brightness ?? 128)) / 255)
  const matrix = isMatrix(device)

  return (
    <Group
      id={matrix ? 'LedMatrixDevice' : 'LedStripDevice'}
      title="Device"
      icon={Cable}
      summary={`pin ${device.pin ?? '—'} · ${lamps} lamps`}
      defaultOpen
    >
      <TextField
        label="Name"
        value={device.id ?? ''}
        onChange={(id) => mutateDevice(index, (next) => { if (id) next.id = id; else delete next.id })}
      />
      {choices.length > 0 ? (
        <PropertyRow label="Pin" hint={HINTS.output.pin}>
          <SelectInput
            value={device.pin === undefined ? '' : String(device.pin)}
            options={device.pin === undefined ? ['', ...choices] : choices}
            onChange={(value) => {
              if (value === '') return
              mutateDevice(index, (next) => { next.pin = Number(value) })
            }}
          />
          {device.pin === undefined ? (
            <p className="pt-0.5 text-[10px] text-amber-400/80">
              No pin yet — the board rejects the document until one is picked.
            </p>
          ) : null}
        </PropertyRow>
      ) : (
        <Hint>This board publishes no free pins for LEDs yet.</Hint>
      )}
      {matrix ? (
        <>
          <PropertyRow label="Size" hint={HINTS.device.size}>
            <div className="grid grid-cols-2 gap-1">
              <NumberInput
                title="Columns"
                value={device.width ?? 8}
                {...fieldBounds('HardwareDeviceConfiguration', 'width')}
                onChange={(width) => mutateDevice(index, (next) => { next.width = width })}
              />
              <NumberInput
                title="Rows"
                value={device.height ?? 8}
                {...fieldBounds('HardwareDeviceConfiguration', 'height')}
                onChange={(height) => mutateDevice(index, (next) => { next.height = height })}
              />
            </div>
            <div className="grid grid-cols-2 gap-1 pt-0.5 text-[10px] text-muted-foreground">
              <span>Columns</span>
              <span>Rows</span>
            </div>
          </PropertyRow>
          <PropertyRow label="Wiring" hint={HINTS.device.wiring}>
            <div className="grid grid-cols-3 gap-1">
              <SelectInput
                value={device.order ?? 'serpentine'}
                options={MATRIX_ORDER_VALUES}
                onChange={(order) => mutateDevice(index, (next) => { next.order = order })}
              />
              <SelectInput
                value={device.origin ?? 'top_left'}
                options={MATRIX_ORIGIN_VALUES}
                onChange={(origin) => mutateDevice(index, (next) => { next.origin = origin })}
              />
              <SelectInput
                value={String(device.rotation_deg ?? 0)}
                options={ROTATIONS}
                onChange={(value) =>
                  mutateDevice(index, (next) => { next.rotation_deg = Number(value) })
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-1 pt-0.5 text-[10px] text-muted-foreground">
              <span>Rows</span>
              <span>First lamp</span>
              <span>Turn</span>
            </div>
          </PropertyRow>
        </>
      ) : (device.segments ?? []).length > 0 ? (
        <PropertyRow label="Lamps" hint={HINTS.device.count}>
          <p className="pt-1 text-xs text-muted-foreground">
            {`${lamps}, summed over the runs in the arrangement below.`}
          </p>
        </PropertyRow>
      ) : (
        <NumberField
          label="Lamps"
          hint={HINTS.device.count}
          value={device.count ?? 1}
          {...fieldBounds('HardwareDeviceConfiguration', 'count')}
          modified={authored(device.count, 1)}
          onChange={(count) => mutateDevice(index, (next) => { next.count = count })}
        />
      )}
      <SelectField
        label="Chip"
        hint={HINTS.output.chip}
        value={device.chip ?? 'ws2812b'}
        options={LED_CHIP_VALUES}
        modified={authored(device.chip, 'ws2812b')}
        onChange={(chip) => mutateDevice(index, (next) => { next.chip = chip })}
      />
      <NumberField
        label="Brightness"
        hint={HINTS.output.brightness}
        value={device.brightness ?? 128}
        min={0}
        max={255}
        modified={authored(device.brightness, 128)}
        onChange={(brightness) => mutateDevice(index, (next) => { next.brightness = brightness })}
      />
      <Advanced
        id={matrix ? 'LedMatrixDevice' : 'LedStripDevice'}
        active={authored(device.gamma, true) || authored(device.current_limit_ma, 0)}
      >
        <CheckboxField
          label="Gamma"
          hint={HINTS.output.gamma}
          checked={device.gamma ?? true}
          modified={authored(device.gamma, true)}
          onChange={(gamma) => mutateDevice(index, (next) => { next.gamma = gamma })}
        />
        <NumberField
          label="Current cap"
          suffix="mA"
          hint={HINTS.output.current}
          value={device.current_limit_ma ?? 0}
          {...fieldBounds('HardwareDeviceConfiguration', 'current_limit_ma')}
          modified={authored(device.current_limit_ma, 0)}
          onChange={(value) => mutateDevice(index, (next) => { next.current_limit_ma = value })}
        />
      </Advanced>
      <p className="text-[10px] text-muted-foreground">
        {lamps} lamps could draw about {peak} mA at full white and this brightness.
        {device.current_limit_ma ? ` The cap holds it to ${device.current_limit_ma} mA.` : ''}
      </p>
    </Group>
  )
}
