import { useEffect, useLayoutEffect, useRef } from 'react'

import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { telemetryBridge } from '@/features/telemetry/bridge-store'
import { gearText, simulatedValue, type SimulatorControl } from './simulator-controls'
import { useSimulatorStore } from './simulator-store'

const SEND_MS = 50
const DECIMALS = 3

function entryOf(binding: string): (typeof TELEMETRY_CATALOG)[number] | undefined {
  return TELEMETRY_CATALOG.find(({ name }) => name === binding)
}

function textOf(control: SimulatorControl, value: number): string {
  if (control.kind === 'toggle') return value >= 1 ? '1' : '0'
  if (control.kind === 'gear') return gearText(control, value)
  const type = entryOf(control.binding)?.type
  if (type === 'uint32' || type === 'int32') return String(Math.round(value))
  return String(Number(value.toFixed(DECIMALS)))
}

export function simulationPayload(
  controls: readonly SimulatorControl[],
  values: Readonly<Record<string, number>>,
  sweeping: string | null,
  nowMs: number
): string {
  return controls
    .flatMap((control) => {
      const wire = entryOf(control.binding)?.wireId
      if (!wire) return []
      return [`${wire};${textOf(control, simulatedValue(control, values, sweeping, nowMs))}\n`]
    })
    .join('')
}

export function clearingPayload(controls: readonly SimulatorControl[]): string {
  return controls
    .flatMap((control) => {
      const wire = entryOf(control.binding)?.wireId
      return wire ? [`${wire};\n`] : []
    })
    .join('')
}

export function useBoardSimulation(controls: readonly SimulatorControl[], enabled: boolean): void {
  const latest = useRef(controls)
  useLayoutEffect(() => {
    latest.current = controls
  })
  const bindings = controls.map(({ binding }) => binding).join(',')

  useEffect(() => {
    if (!enabled) return undefined
    const bridge = telemetryBridge()
    const started = performance.now()
    const send = (): void => {
      const { values, sweeping, idle } = useSimulatorStore.getState()
      const payload = idle
        ? ''
        : simulationPayload(latest.current, values, sweeping, performance.now() - started)
      void bridge.simulate({ payload, active: true })
    }
    send()
    const timer = window.setInterval(send, SEND_MS)
    return () => {
      window.clearInterval(timer)
      void bridge.simulate({ payload: clearingPayload(latest.current), active: false })
    }
  }, [bindings, enabled])
}
