import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { writeDevelopmentLog } from '@/features/development/development-log'
import { useDeviceStore } from '@/features/device/device-store'
import type { FontUploadProgress } from '../../../../shared/font-assets'
import { useFontAssetsStore } from './font-assets-store'
import {
  collectFontRequirements,
  groupFontRequirements,
  missingFontFamilies
} from './font-requirements'

export function FontAssetsPanel(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const sources = useFontAssetsStore((state) => state.sources)
  const progress = useFontAssetsStore((state) => state.progress)
  const error = useFontAssetsStore((state) => state.error)
  const operationStartedAt = useFontAssetsStore((state) => state.operationStartedAt)
  const setSource = useFontAssetsStore((state) => state.setSource)
  const setProgress = useFontAssetsStore((state) => state.setProgress)
  const setError = useFontAssetsStore((state) => state.setError)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(
    () => window.simcore.onFontUploadProgress((next) => {
      writeDevelopmentLog('Font upload progress', next)
      setProgress(next)
    }),
    [setProgress]
  )

  useEffect(() => {
    if (!operationStartedAt || !workingStage(progress?.stage)) return
    const updateElapsed = (): void => {
      setElapsedSeconds(Math.floor((Date.now() - operationStartedAt) / 1_000))
    }
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1_000)
    return () => window.clearInterval(timer)
  }, [operationStartedAt, progress?.stage])

  const required = useMemo(
    () => (draft ? collectFontRequirements(draft) : []),
    [draft]
  )
  const missing = missingFontFamilies(required, session?.fontAssets?.families ?? [])
  const groups = groupFontRequirements(required)
  const packageReplacementNeeded = missing.length > 0
  const working = workingStage(progress?.stage)

  const chooseSource = async (family: string): Promise<void> => {
    const result = await window.simcore.selectFontSource()
    writeDevelopmentLog(`Font source selection for ${family}`, result)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    if (result.value) setSource(family, result.value)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Font assets</CardTitle>
        <CardDescription>Required by the configuration.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-muted-foreground">
          {fontSummary(Boolean(session), groups.size, missing.length)}
        </p>

        {groups.size > 0 ? (
          <div className="space-y-2">
            {[...groups].map(([family, sizes]) => {
              const source = sources[family]
              const familyMissing = missing.includes(family)
              const needsSource = packageReplacementNeeded
              return (
                <div key={family} className="rounded-md border p-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium" title={family}>{family}</span>
                    <span className={familyMissing ? 'text-amber-400' : 'text-emerald-400'}>
                      {familyMissing ? 'Missing' : 'Installed'}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Rendered at {sizes.map((size) => `${size}px`).join(', ')}
                  </p>
                  {needsSource ? (
                    <Button
                      className="mt-2 h-7 w-full text-[11px]"
                      disabled={working}
                      variant="outline"
                      onClick={() => void chooseSource(family)}
                    >
                      {source ? source.name : 'Choose TTF / OTF'}
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="rounded-md border p-2 text-[11px] text-muted-foreground">
            No dashboard fonts are referenced by this configuration.
          </p>
        )}

        {packageReplacementNeeded ? (
          <p className="text-[11px] text-amber-400">
            Saving will replace the complete device font package with the families shown
            above. An installed family covers every size, so changing a size never needs
            another upload.
          </p>
        ) : null}

        {progress ? <Progress progress={progress} elapsedSeconds={elapsedSeconds} /> : null}
        {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
        {working ? (
          <Button className="w-full" variant="outline" onClick={() => void window.simcore.cancelFontUpload()}>
            Cancel font upload
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Progress({
  progress,
  elapsedSeconds
}: {
  progress: FontUploadProgress
  elapsedSeconds: number
}): React.JSX.Element {
  const percent = progress.total > 0
    ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
    : 0
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/20 p-2 text-[11px] text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{stageLabel(progress.stage)}</span>
        <span>{formatElapsed(elapsedSeconds)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="break-words">{progress.message}</p>
    </div>
  )
}

function fontSummary(connected: boolean, required: number, missing: number): string {
  if (!connected) return 'Connect a device to check the required fonts.'
  if (required === 0) return 'No font families required.'
  if (missing === 0) return `All ${required} required font families are installed.`
  return `${missing} of ${required} required font families are missing.`
}

function workingStage(stage: FontUploadProgress['stage'] | undefined): boolean {
  return stage !== undefined && ['reading', 'building', 'erasing', 'uploading', 'committing'].includes(stage)
}

function stageLabel(stage: FontUploadProgress['stage']): string {
  return ({
    reading: 'Reading font files',
    building: 'Building package',
    erasing: 'Preparing device storage',
    uploading: 'Uploading fonts',
    committing: 'Committing fonts',
    completed: 'Fonts uploaded',
    cancelled: 'Cancelled',
    error: 'Failed'
  })[stage]
}

function formatElapsed(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
