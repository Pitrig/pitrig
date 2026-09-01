import { useEffect } from 'react'

import { documentsDiffering } from '@shared/configuration-documents'
import { formatConfiguration, useDeviceStore } from '@/features/device/device-store'
import { soloConfiguration } from './board-preview'
import { useModulesStore } from './modules-store'

const APPLY_DELAY_MS = 250

export function useBoardPreview(enabled: boolean): void {
  const draft = useDeviceStore((state) => state.draft)
  const running = useDeviceStore((state) => state.runningConfiguration)
  const preview = useModulesStore((state) => state.preview)
  const reportPreviewError = useModulesStore((state) => state.reportPreviewError)

  useEffect(() => {
    if (!enabled || !draft || !preview) return undefined
    const configuration = soloConfiguration(draft, preview.output, preview.effect)
    if (!configuration || documentsDiffering(configuration, running).length === 0) {
      return undefined
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await window.simcore.applyDeviceConfiguration({
          json: formatConfiguration(configuration),
          documents: ['modules']
        })
        if (cancelled) return
        if (result.ok) {
          useDeviceStore.getState().markLiveApplied(configuration)
          reportPreviewError(undefined)
        } else {
          reportPreviewError(result.error.message)
        }
      })()
    }, APPLY_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draft, enabled, preview, reportPreviewError, running])
}
