import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { writeDevelopmentLog } from '@/features/development/development-log'
import { useDeviceStore } from '@/features/device/device-store'
import {
  FONT_FAMILY_PATTERN,
  MAXIMUM_FONT_ASSETS,
  MAXIMUM_FONT_SIZE_PX,
  type FontSourceSelection,
  type FontUploadProgress
} from '../../../../shared/font-assets'

interface FontDraft {
  id: string
  source: FontSourceSelection
  family: string
  sizePx: string
}

export function FontAssetsPanel(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const [drafts, setDrafts] = useState<FontDraft[]>([])
  const [progress, setProgress] = useState<FontUploadProgress>()
  const [error, setError] = useState<string>()
  const [operationStartedAt, setOperationStartedAt] = useState<number>()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(
    () => window.simcore.onFontUploadProgress((next) => {
      writeDevelopmentLog('Font upload progress', next)
      setProgress(next)
      if (next.stage !== 'error') setError(undefined)
    }),
    []
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

  const working = workingStage(progress?.stage)
  const valid = useMemo(
    () => drafts.length > 0 && drafts.every(validDraft) && uniqueAssets(drafts),
    [drafts]
  )
  const fontInfo = session?.fontAssets
  const canUpload = Boolean(
    session && fontInfo?.storageAvailable && !fontInfo.rebootRequired && valid && !working
  )

  const addFont = async (): Promise<void> => {
    const result = await window.simcore.selectFontSource()
    writeDevelopmentLog('Font source selection', result)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    if (!result.value) return
    const source = result.value
    setDrafts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        source,
        family: suggestedFamily(source.name),
        sizePx: '24'
      }
    ])
    setProgress(undefined)
    setError(undefined)
  }

  const upload = async (): Promise<void> => {
    setError(undefined)
    setProgress(undefined)
    setElapsedSeconds(0)
    setOperationStartedAt(Date.now())
    const request = {
      assets: drafts.map((draft) => ({
        sourceId: draft.source.id,
        family: draft.family,
        sizePx: Number(draft.sizePx)
      }))
    }
    writeDevelopmentLog('Font upload requested', request)
    const result = await window.simcore.uploadFontAssets(request)
    writeDevelopmentLog('Font upload completed', result)
    if (!result.ok) setError(result.error.message)
  }

  const reboot = async (): Promise<void> => {
    const result = await window.simcore.rebootDevice()
    writeDevelopmentLog('Device reboot after font upload', result)
    if (!result.ok) setError(result.error.message)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Font assets</CardTitle>
        <CardDescription>
          Uploads replace the complete custom-font set. Built-in Montserrat is unaffected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{fontStatus(session !== undefined, fontInfo)}</span>
          <span>{drafts.length}/{MAXIMUM_FONT_ASSETS}</span>
        </div>

        <div className="max-h-[20rem] space-y-2 overflow-auto">
          {drafts.map((draft) => (
            <div key={draft.id} className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px]" title={draft.source.name}>
                  {draft.source.name}
                </span>
                <button
                  aria-label={`Remove ${draft.source.name}`}
                  className="text-xs text-muted-foreground hover:text-red-400 disabled:opacity-50"
                  disabled={working}
                  type="button"
                  onClick={() => setDrafts((current) => current.filter(({ id }) => id !== draft.id))}
                >
                  Remove
                </button>
              </div>
              <input
                aria-label="Font family"
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                disabled={working}
                maxLength={31}
                placeholder="family_id"
                value={draft.family}
                onChange={(event) => updateDraft(setDrafts, draft.id, { family: event.target.value })}
              />
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                Size
                <input
                  aria-label="Font size in pixels"
                  className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs text-foreground"
                  disabled={working}
                  inputMode="numeric"
                  max={255}
                  min={1}
                  type="number"
                  value={draft.sizePx}
                  onChange={(event) => updateDraft(setDrafts, draft.id, { sizePx: event.target.value })}
                />
                px
              </label>
            </div>
          ))}
        </div>

        <Button
          className="w-full"
          disabled={working || drafts.length >= MAXIMUM_FONT_ASSETS}
          variant="outline"
          onClick={() => void addFont()}
        >
          Add TTF / OTF
        </Button>

        {progress ? (
          <div className="space-y-1.5 rounded-md border bg-muted/20 p-2 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{stageLabel(progress.stage)}</span>
              <span>{formatElapsed(elapsedSeconds)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={progressBarClass(progress)}
                style={{ width: `${progressPercent(progress)}%` }}
              />
            </div>
            <p className="break-words">{progress.message}</p>
            <p>{progressDetail(progress)}</p>
          </div>
        ) : null}
        {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
        {!valid && drafts.length > 0 ? (
          <p className="text-[11px] text-amber-400">
            Family must use 1–31 lowercase letters, digits, “_” or “-”; family and size pairs must be unique.
          </p>
        ) : null}

        {working ? (
          <Button className="w-full" variant="outline" onClick={() => void window.simcore.cancelFontUpload()}>
            Cancel
          </Button>
        ) : fontInfo?.rebootRequired || progress?.stage === 'completed' ? (
          <Button className="w-full" onClick={() => void reboot()}>
            Restart device
          </Button>
        ) : (
          <Button className="w-full" disabled={!canUpload} onClick={() => void upload()}>
            Convert and upload
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function updateDraft(
  setDrafts: React.Dispatch<React.SetStateAction<FontDraft[]>>,
  id: string,
  patch: Partial<Pick<FontDraft, 'family' | 'sizePx'>>
): void {
  setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft))
}

function validDraft(draft: FontDraft): boolean {
  const size = Number(draft.sizePx)
  return FONT_FAMILY_PATTERN.test(draft.family) && Number.isInteger(size) &&
    size >= 1 && size <= MAXIMUM_FONT_SIZE_PX
}

function uniqueAssets(drafts: FontDraft[]): boolean {
  const keys = drafts.map(({ family, sizePx }) => `${family}:${Number(sizePx)}`)
  return new Set(keys).size === keys.length
}

function suggestedFamily(name: string): string {
  const withoutExtension = name.replace(/\.(?:ttf|otf)$/i, '')
  const normalized = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 31)
  return normalized || 'custom_font'
}

function fontStatus(connected: boolean, info: FontAssetStatus | undefined): string {
  if (!connected) return 'Connect a device to upload.'
  if (!info) return 'Firmware does not support font upload.'
  if (!info.storageAvailable) return 'Font storage unavailable.'
  if (info.rebootRequired) {
    return `${info.assetCount} custom font${info.assetCount === 1 ? '' : 's'} ready after restart`
  }
  if (!info.packageAvailable) return 'No custom fonts installed.'
  return `${info.assetCount} custom font${info.assetCount === 1 ? '' : 's'} active`
}

interface FontAssetStatus {
  storageAvailable: boolean
  packageAvailable: boolean
  assetCount: number
  rebootRequired: boolean
}

function progressPercent(progress: FontUploadProgress): number {
  if (progress.stage === 'completed') return 100
  if (indeterminateStage(progress.stage)) return 100
  if (progress.total <= 0) return 0
  return Math.min(100, Math.round((progress.completed / progress.total) * 100))
}

function workingStage(stage: FontUploadProgress['stage'] | undefined): boolean {
  return stage !== undefined && ['converting', 'building', 'erasing', 'uploading', 'committing'].includes(stage)
}

function indeterminateStage(stage: FontUploadProgress['stage']): boolean {
  return ['converting', 'building', 'erasing', 'committing'].includes(stage)
}

function progressBarClass(progress: FontUploadProgress): string {
  return indeterminateStage(progress.stage)
    ? 'h-full origin-left animate-pulse bg-sky-500/80'
    : 'h-full bg-sky-500 transition-[width]'
}

function stageLabel(stage: FontUploadProgress['stage']): string {
  const labels: Record<FontUploadProgress['stage'], string> = {
    converting: 'Converting fonts',
    building: 'Building package',
    erasing: 'Preparing device storage',
    uploading: 'Uploading to device',
    committing: 'Committing package',
    completed: 'Completed',
    cancelled: 'Cancelled',
    error: 'Failed'
  }
  return labels[stage]
}

function progressDetail(progress: FontUploadProgress): string {
  if (progress.stage === 'converting') {
    const completedCurrentFont = progress.message.startsWith('Converted ')
    const current = Math.min(progress.total, progress.completed + (completedCurrentFont ? 0 : 1))
    return `Font ${current} of ${progress.total}`
  }
  if (progress.stage === 'uploading') {
    return `${progressPercent(progress)}% · ${formatBytes(progress.completed)} / ${formatBytes(progress.total)}`
  }
  if (progress.stage === 'building') return `${progress.total} fonts converted`
  if (progress.stage === 'completed') return `${formatBytes(progress.total)} uploaded`
  if (progress.stage === 'cancelled') return 'Operation stopped by the user.'
  if (progress.stage === 'error') return 'Operation stopped with an error.'
  return 'Waiting for the device'
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KiB`
}
