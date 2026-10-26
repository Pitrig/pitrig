import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { MAXIMUM_LED_PARTS, type HardwareDeviceConfiguration } from '@shared/configuration-schema'
import { coversWhole, partsFromLamps } from '@shared/led-parts'
import { lampsOf } from '@shared/led-render'
import { useDeviceStore } from '@/features/device/device-store'
import { applyParts } from './lamp-parts'
import { updateEffects } from './layer-commands'
import { lampsOfLayer, panelPixelOf, zoneLamps } from './layer-lamps'
import { useModulesStore } from './modules-store'
import { withPanelPixel } from './panel-pixels'

export interface LampRun {
  first: number
  last: number
}

interface Drag {
  anchor: number
  current: number
  adding: boolean
  zone: boolean
}

export interface LampPicking {
  hover: number | null
  pending: LampRun | null
  onLampDown: (lamp: number, event: React.PointerEvent) => void
  onLampEnter: (lamp: number) => void
  onLeave: () => void
}

function runOf(first: number, second: number): LampRun {
  return { first: Math.min(first, second), last: Math.max(first, second) }
}

function changed(lamps: ReadonlySet<number>, run: LampRun, adding: boolean): Set<number> {
  const next = new Set(lamps)
  for (let lamp = run.first; lamp <= run.last; ++lamp) {
    if (adding) next.add(lamp)
    else next.delete(lamp)
  }
  return next
}

export function topLayerAt(
  lamp: number,
  order: readonly number[],
  coverage: readonly ReadonlySet<number>[]
): number {
  for (let at = order.length - 1; at >= 0; --at) {
    const index = order[at] as number
    if (coverage[index]?.has(lamp)) return index
  }
  for (let index = coverage.length - 1; index >= 0; --index) {
    if (coverage[index]?.has(lamp)) return index
  }
  return -1
}

export function useLampPicking({
  output,
  device,
  coverage,
  order,
  editing
}: {
  output: number
  device: HardwareDeviceConfiguration
  coverage: readonly ReadonlySet<number>[]
  order: readonly number[]
  editing: boolean
}): LampPicking {
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [stroke, setStroke] = useState<boolean | null>(null)
  const painting = useRef<boolean | null>(null)
  const latest = useRef({ output, device, coverage, order, editing, drag })
  useLayoutEffect(() => {
    latest.current = { output, device, coverage, order, editing, drag }
  })

  const assignLayers = useCallback((run: LampRun, adding: boolean): void => {
    const { output: target, device: current } = latest.current
    updateEffects(target, useModulesStore.getState().picked, (effect) => {
      const chosen = changed(lampsOfLayer(current, effect), run, adding)
      if (chosen.size === 0) return
      const parts = partsFromLamps(chosen, effect.parts ?? [])
      if (parts.length <= MAXIMUM_LED_PARTS) applyParts(effect, parts, lampsOf(current))
    })
  }, [])

  const assignZone = useCallback((run: LampRun, adding: boolean): void => {
    const { output: target, device: current } = latest.current
    const store = useModulesStore.getState()
    const zone = store.zone
    if (!zone || zone.output !== target) return
    const start = zone.touched ? zoneLamps(current, zone.parts) : new Set<number>()
    const chosen = changed(start, run, adding)
    if (chosen.size === 0) return
    const parts = partsFromLamps(chosen, zone.parts ?? [])
    if (parts.length > MAXIMUM_LED_PARTS) return
    const whole = coversWhole(parts, lampsOf(current))
    store.setZone({ output: target, ...(whole ? {} : { parts }), touched: true })
  }, [])

  const paintPixel = useCallback((lamp: number, on: boolean): void => {
    const { output: target, device: current } = latest.current
    const pixel = panelPixelOf(current, lamp)
    if (pixel === undefined) return
    updateEffects(target, useModulesStore.getState().picked, (effect) =>
      withPanelPixel(effect, current, pixel, on)
    )
  }, [])

  const pickTop = useCallback((lamp: number): void => {
    const { coverage: covered, order: painted } = latest.current
    useModulesStore.getState().selectEffect(topLayerAt(lamp, painted, covered))
  }, [])

  const onLampDown = useCallback(
    (lamp: number, event: React.PointerEvent): void => {
      if (event.button !== 0) return
      const { output: target, device: current, editing: armed, coverage: covered } = latest.current
      const store = useModulesStore.getState()
      if (event.altKey) {
        pickTop(lamp)
        return
      }
      const strip = current.type === 'rgb_strip'
      const zone = store.zone?.output === target ? store.zone : null
      if (zone && strip) {
        event.preventDefault()
        const adding = !zone.touched || !zoneLamps(current, zone.parts).has(lamp)
        setDrag({ anchor: lamp, current: lamp, adding, zone: true })
        return
      }
      const primary = (current.effects ?? [])[store.effect]
      if (!armed || !primary || store.picked.length === 0) {
        pickTop(lamp)
        return
      }
      event.preventDefault()
      const adding = !(covered[store.effect]?.has(lamp) ?? false)
      if (strip) {
        setDrag({ anchor: lamp, current: lamp, adding, zone: false })
        return
      }
      useDeviceStore.getState().beginEdit()
      painting.current = adding
      setStroke(adding)
      paintPixel(lamp, adding)
    },
    [paintPixel, pickTop]
  )

  const onLampEnter = useCallback(
    (lamp: number): void => {
      setHover(lamp)
      setDrag((current) => (current ? { ...current, current: lamp } : current))
      if (painting.current !== null) paintPixel(lamp, painting.current)
    },
    [paintPixel]
  )

  const onLeave = useCallback((): void => setHover(null), [])

  useEffect(() => {
    if (!drag && stroke === null) return undefined
    const finish = (): void => {
      const done = latest.current.drag
      setDrag(null)
      if (done?.zone) assignZone(runOf(done.anchor, done.current), done.adding)
      else if (done) assignLayers(runOf(done.anchor, done.current), done.adding)
      if (painting.current !== null) {
        painting.current = null
        setStroke(null)
        useDeviceStore.getState().endEdit()
      }
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [assignLayers, assignZone, drag, stroke])

  return {
    hover,
    pending: drag ? runOf(drag.anchor, drag.current) : null,
    onLampDown,
    onLampEnter,
    onLeave
  }
}
