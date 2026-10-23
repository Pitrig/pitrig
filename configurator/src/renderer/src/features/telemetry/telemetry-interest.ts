import { useEffect, useMemo } from 'react'
import { create } from 'zustand'

import { telemetryBindings } from '@shared/configuration-access'
import { useDeviceStore } from '@/features/device/device-store'
import { telemetryBridge } from './bridge-store'

const useCatalogWatchers = create<{ count: number }>(() => ({ count: 0 }))

function bindingKey(bindings: string[]): string {
  return [...bindings].sort().join(',')
}

function bindingList(key: string): string[] {
  return key.length === 0 ? [] : key.split(',')
}

export function useCatalogInterest(): void {
  useEffect(() => {
    useCatalogWatchers.setState((state) => ({ count: state.count + 1 }))
    return () => useCatalogWatchers.setState((state) => ({ count: state.count - 1 }))
  }, [])
}

export function useTelemetryInterest(): void {
  const draft = useDeviceStore((state) => state.draft)
  const running = useDeviceStore((state) => state.runningConfiguration)
  const all = useCatalogWatchers((state) => state.count > 0)
  const draftKey = useMemo(() => bindingKey(telemetryBindings(draft)), [draft])
  const runningKey = useMemo(() => bindingKey(telemetryBindings(running)), [running])

  useEffect(() => {
    void telemetryBridge().setInterest({
      running: bindingList(runningKey),
      draft: bindingList(draftKey),
      all
    })
  }, [draftKey, runningKey, all])
}
