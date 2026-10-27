import type { HardwareDeviceConfiguration, LedEffect } from '@shared/configuration-schema'
import type { LayerDrive } from '@shared/led-compose'
import { LED_EFFECT_READS_VALUE } from '@shared/led-render'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { layerName } from './layer-name'

export const GEARS: readonly string[] = ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8', '9']

const GEAR_BINDINGS: ReadonlySet<string> = new Set(['transmission.gear', 'transmission.gear_number'])
const SWEEP_MS = 4000
const SHOWN_NAMES = 2

export type SimulatorKind = 'toggle' | 'slider' | 'gear'

export interface SimulatorControl {
  binding: string
  kind: SimulatorKind
  label: string
  title: string
  minimum: number
  maximum: number
  step: number
  initial: number
  unit: string
}

interface Usage {
  names: string[]
  ranges: number[]
  thresholds: number[]
}

function usagesOf(effects: readonly LedEffect[]): Map<string, Usage> {
  const usages = new Map<string, Usage>()
  const note = (binding: string | undefined, name: string): Usage | undefined => {
    if (!binding) return undefined
    const usage = usages.get(binding) ?? { names: [], ranges: [], thresholds: [] }
    if (!usage.names.includes(name)) usage.names.push(name)
    usages.set(binding, usage)
    return usage
  }
  for (const [index, effect] of effects.entries()) {
    const name = layerName(effect, index)
    if (LED_EFFECT_READS_VALUE.has(effect.type ?? 'solid')) {
      note(effect.source?.binding, name)?.ranges.push(effect.minimum ?? 0, effect.maximum ?? 1)
    }
    const watched = note(effect.condition_source?.binding, name)
    for (const rule of [...(effect.conditions ?? []), ...(effect.color_rules ?? [])]) {
      watched?.thresholds.push(rule.value ?? 0)
    }
  }
  return usages
}

function niceStep(span: number): number {
  const raw = span / 200
  const power = 10 ** Math.floor(Math.log10(raw || 1))
  return [1, 2, 5, 10].map((factor) => factor * power).find((step) => step >= raw) ?? power
}

function labelOf(names: readonly string[]): string {
  const shown = names.slice(0, SHOWN_NAMES).join(', ')
  return names.length > SHOWN_NAMES ? `${shown} +${names.length - SHOWN_NAMES}` : shown
}

function controlOf(binding: string, usage: Usage): SimulatorControl | undefined {
  const entry = TELEMETRY_CATALOG.find(({ name }) => name === binding)
  if (!entry) return undefined
  const base = {
    binding,
    label: labelOf(usage.names),
    title: `${binding} — ${entry.description}`,
    unit: entry.unit
  }
  if (GEAR_BINDINGS.has(binding)) {
    return { ...base, kind: 'gear', minimum: 0, maximum: GEARS.length - 1, step: 1, initial: 3 }
  }
  if (entry.type === 'boolean') {
    return { ...base, kind: 'toggle', minimum: 0, maximum: 1, step: 1, initial: 0 }
  }
  if (entry.type === 'text') return undefined
  const marks = [...usage.ranges, ...usage.thresholds]
  if (entry.unit === 'percent') marks.push(0, 100)
  let minimum = Math.min(0, ...marks)
  let maximum = Math.max(...marks)
  if (usage.ranges.length === 0) maximum += Math.max(1, (maximum - minimum) * 0.1)
  if (maximum <= minimum) maximum = minimum + 1
  const integral = entry.type === 'uint32' || entry.type === 'int32'
  if (integral) {
    minimum = Math.floor(minimum)
    maximum = Math.ceil(maximum)
  }
  const initial = usage.ranges.length > 0 ? minimum + (maximum - minimum) * 0.75 : minimum
  return {
    ...base,
    kind: 'slider',
    minimum,
    maximum,
    step: integral ? 1 : niceStep(maximum - minimum),
    initial: integral ? Math.round(initial) : initial
  }
}

export function simulatorControls(device: HardwareDeviceConfiguration): SimulatorControl[] {
  return [...usagesOf(device.effects ?? []).entries()].flatMap(([binding, usage]) => {
    const control = controlOf(binding, usage)
    return control ? [control] : []
  })
}

export function sweepValue(control: SimulatorControl, nowMs: number): number {
  const phase = (nowMs % SWEEP_MS) / SWEEP_MS
  return control.minimum + (control.maximum - control.minimum) * (1 - Math.abs(2 * phase - 1))
}

export function simulatedValue(
  control: SimulatorControl,
  values: Readonly<Record<string, number>>,
  sweeping: string | null,
  nowMs: number
): number {
  if (sweeping === control.binding) return sweepValue(control, nowMs)
  return values[control.binding] ?? control.initial
}

export function gearText(control: SimulatorControl, value: number): string {
  const index = Math.max(0, Math.min(GEARS.length - 1, Math.round(value)))
  return control.binding === 'transmission.gear_number' ? String(index - 1) : (GEARS[index] ?? '')
}

export function simulatedDrives(
  device: HardwareDeviceConfiguration,
  controls: readonly SimulatorControl[],
  values: Readonly<Record<string, number>>,
  sweeping: string | null,
  nowMs: number
): LayerDrive[] {
  const byBinding = new Map(controls.map((control) => [control.binding, control]))
  const resolve = (binding: string | undefined): number | undefined => {
    const control = binding ? byBinding.get(binding) : undefined
    return control ? simulatedValue(control, values, sweeping, nowMs) : undefined
  }
  return (device.effects ?? []).map((effect) => {
    const watched = resolve(effect.condition_source?.binding)
    const binding = LED_EFFECT_READS_VALUE.has(effect.type ?? 'solid') ? effect.source?.binding : undefined
    const value = resolve(binding)
    const control = binding ? byBinding.get(binding) : undefined
    if (control?.kind === 'gear' && value !== undefined) {
      return { watched, value: Math.round(value) - 1, valueText: gearText(control, value) }
    }
    return { watched, value }
  })
}
