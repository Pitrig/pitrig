import { useEffect, useMemo, useState } from 'react'

import {
  composeOutput,
  type ComposeInput,
  type Composition,
  type LayerState
} from '@shared/led-compose'
import { paintOutput } from '@shared/led-paint'
import { newRuleState, type LedRuleState } from '@shared/led-colors'
import type { HardwareDeviceConfiguration, RgbColor } from '@shared/configuration-schema'
import { PageSection } from '@/app/workspace/PageShell'
import { readLiveValue, telemetryIsLive, useLiveRevision } from '@/features/telemetry/live-telemetry'
import { t } from '@shared/ui-text'
import { playedLayersOf, type PlayedLayer } from './board-preview'
import { coverageOf, unionOf, zoneLamps } from './layer-lamps'
import { layerName } from './layer-name'
import { LampMap, type LampMark } from './LampMap'
import { useModulesStore } from './modules-store'
import { hoverText, pickingHint } from './preview-hint'
import { liveDrive, previewDrive, previewNote } from './preview-values'
import { Simulator } from './Simulator'
import { simulatedDrives, simulatorControls } from './simulator-controls'
import { followsSimHub, useSimulatorStore, type TelemetryState } from './simulator-store'
import { useLampPicking } from './use-lamp-picking'
import { useBoardSimulation } from './board-simulation'
import { useDeviceStore } from '@/features/device/device-store'

const SWEEP_MS = 4000
const SHOWN_BRIGHTNESS = 255
const TICK_MS = 33

function useElapsed(): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const started = performance.now()
    let frame = 0
    let shown = -TICK_MS
    const step = (time: number): void => {
      const since = time - started
      if (since - shown >= TICK_MS) {
        shown = since
        setElapsed(since)
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [])
  return elapsed
}

interface Composer {
  device?: HardwareDeviceConfiguration
  states: LayerState[]
}

function composeFor(
  composer: Composer,
  device: HardwareDeviceConfiguration,
  input: ComposeInput
): Composition {
  if (composer.device !== device) {
    composer.device = device
    composer.states = []
  }
  return composeOutput({ ...device, brightness: SHOWN_BRIGHTNESS }, input, composer.states)
}

function telemetryState(device: HardwareDeviceConfiguration): TelemetryState {
  if (!telemetryIsLive()) return 'none'
  const telling = (binding: string | undefined): boolean => {
    const value = readLiveValue(binding)
    return value.available && (value.type !== 'boolean' || value.number !== 0)
  }
  const flowing = (device.effects ?? []).some(
    (layer) => telling(layer.source?.binding) || telling(layer.condition_source?.binding)
  )
  return flowing ? 'game' : 'idle'
}

function playedFrame(
  device: HardwareDeviceConfiguration,
  played: readonly PlayedLayer[],
  elapsed: number,
  states: readonly LedRuleState[]
): RgbColor[] {
  const layers = played.map(({ layer }) => layer)
  const drives = layers.map((layer) => previewDrive(layer, elapsed))
  return paintOutput(
    { ...device, brightness: SHOWN_BRIGHTNESS, effects: layers },
    {
      value: (elapsed % SWEEP_MS) / SWEEP_MS,
      elapsedMs: elapsed,
      gates: layers.map(() => true),
      valueText: drives.map(({ valueText }) => valueText),
      watched: drives.map(({ watched }) => watched),
      values: drives.map(({ value }) => value),
      states
    }
  )
}

export function LedPreview({
  index,
  device
}: {
  index: number
  device: HardwareDeviceConfiguration
}): React.JSX.Element {
  const zone = useModulesStore((state) => state.zone)
  const preview = useModulesStore((state) => state.preview)
  const played = playedLayersOf(
    device,
    preview.filter((entry) => entry.output === index)
  )
  const marked = zone?.output === index ? zoneLamps(device, zone.parts) : null

  return (
    <PageSection title={t('modules.ledPreview.preview')} description={describe(played)}>
      <LivePreview
        key={`${index}:${played.length}`}
        output={index}
        device={device}
        played={played}
        zone={marked}
      />
    </PageSection>
  )
}

function LivePreview({
  output,
  device,
  played,
  zone
}: {
  output: number
  device: HardwareDeviceConfiguration
  played: readonly PlayedLayer[]
  zone: ReadonlySet<number> | null
}): React.JSX.Element {
  useLiveRevision()
  const elapsed = useElapsed()
  const telemetry = telemetryState(device)
  const source = useSimulatorStore((state) => state.source)
  const values = useSimulatorStore((state) => state.values)
  const sweeping = useSimulatorStore((state) => state.sweeping)
  const idle = useSimulatorStore((state) => state.idle)
  const deviceView = useModulesStore((state) => state.deviceView)
  const effect = useModulesStore((state) => state.effect)
  const picked = useModulesStore((state) => state.picked)
  const following = followsSimHub(source, telemetry)
  const onBoard = useSimulatorStore((state) => state.onBoard)
  const connected = useDeviceStore((state) => state.status === 'connected' && state.session !== undefined)
  const controls = useMemo(() => simulatorControls(device), [device])
  useBoardSimulation(controls, onBoard && connected && !following && played.length === 0)
  const coverage = useMemo(() => coverageOf(device), [device])
  const [composer] = useState<Composer>(() => ({ states: [] }))
  const [ruleStates] = useState<LedRuleState[]>(() => played.map(() => newRuleState()))

  let frame: RgbColor[]
  let order: readonly number[] = []
  if (played.length > 0) {
    frame = playedFrame(device, played, elapsed, ruleStates)
  } else {
    const effects = device.effects ?? []
    const drives = following
      ? effects.map((layer) => liveDrive(layer))
      : simulatedDrives(device, controls, values, sweeping, elapsed)
    const composition = composeFor(composer, device, {
      nowMs: elapsed,
      idle: following ? false : idle,
      drives
    })
    frame = composition.frame
    order = composition.order
  }

  const editing = deviceView === 'layers' && played.length === 0
  const picking = useLampPicking({ output, device, coverage, order, editing })
  const chosen = useMemo(
    () => unionOf(picked.map((index) => coverage[index] ?? new Set<number>())),
    [coverage, picked]
  )
  const mark = (lamp: number): LampMark => {
    if (picking.pending) {
      return lamp >= picking.pending.first && lamp <= picking.pending.last ? 'pending' : 'none'
    }
    if (zone) return zone.has(lamp) ? 'selected' : 'none'
    return chosen.has(lamp) ? 'selected' : 'none'
  }

  return (
    <div className="space-y-2">
      <LampMap
        device={device}
        frame={frame}
        mark={mark}
        onLampDown={picking.onLampDown}
        onLampEnter={picking.onLampEnter}
        onLeave={picking.onLeave}
      />
      <p className="min-h-4 text-[11px] text-muted-foreground">
        {picking.hover !== null
          ? hoverText(device, coverage, order, picking.hover)
          : pickingHint(device, zone !== null, editing, effect)}
      </p>
      {played.length === 0 ? (
        <Simulator device={device} controls={controls} telemetry={telemetry} nowMs={elapsed} />
      ) : null}
    </div>
  )
}

function nameOf({ target, layer }: PlayedLayer): string {
  return target.kind === 'sprite'
    ? t('modules.ledPreview.pictureSprite', { sprite: target.sprite ?? '' })
    : layerName(layer, target.effect)
}

function describe(played: readonly PlayedLayer[]): string {
  const first = played[0]
  if (!first) {
    return t('modules.ledPreview.everyLampAsTheBoard')
  }
  if (played.length === 1) {
    return t('modules.ledPreview.nameOnItsOwnOver', {
      name: nameOf(first),
      note: previewNote(first.layer)
    })
  }
  return t('modules.ledPreview.namesTogetherOverAndOver', { names: played.map(nameOf).join(', ') })
}
