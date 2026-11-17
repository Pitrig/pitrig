import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { formatConfiguration, useDeviceStore } from '@/features/device/device-store'
import { useDraftState } from '@/features/device/draft-state'
import { kilobytes } from '@/features/font-library/font-library-store'
import { DEFAULT_CONFIGURATION_FILE_NAME } from '@shared/configuration-files'
import type { DashboardShareSummary } from '@shared/dashboard-files'
import { MAXIMUM_TEMPLATE_DESCRIPTION, MAXIMUM_TEMPLATE_NAME } from '@shared/templates'
import { t } from '@shared/ui-text'

export function ShareDashboardButton({ className }: { className?: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { parsed } = useDraftState()
  return (
    <>
      <Button
        className={className}
        variant="outline"
        disabled={!parsed.ok}
        title={t('share.button.title')}
        onClick={() => setOpen(true)}
      >
        {t('share.button.label')}
      </Button>
      {open ? <ShareDashboardDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function ShareDashboardDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const draftFileName = useDeviceStore((state) => state.draftFileName)
  const [name, setName] = useState(() => defaultName(draftFileName))
  const [description, setDescription] = useState('')
  const [summary, setSummary] = useState<DashboardShareSummary>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState<string>()

  useEffect(() => {
    if (!draft) return
    let current = true
    window.pitrig
      .inspectDashboardShare({ json: formatConfiguration(draft) })
      .then((result) => {
        if (!current) return
        if (result.ok) setSummary(result.value)
        else setError(result.error.message)
      })
      .catch((reason: unknown) => {
        if (current) setError(reason instanceof Error ? reason.message : t('share.errors.notSaved'))
      })
    return () => {
      current = false
    }
  }, [draft])

  const trimmed = name.trim()
  const valid = trimmed.length > 0 && trimmed.length <= MAXIMUM_TEMPLATE_NAME

  const save = async (): Promise<void> => {
    if (!draft || !valid) return
    setBusy(true)
    setError(undefined)
    try {
      const note = description.trim()
      const result = await window.pitrig.saveDashboardShare({
        json: formatConfiguration(draft),
        name: trimmed,
        ...(note ? { description: note } : {})
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (!result.value.saved) return
      const missing = [...(result.value.missingImages ?? []), ...(result.value.missingFonts ?? [])]
      setSaved(
        [
          t('share.dialog.saved', {
            fileName: result.value.fileName ?? '',
            size: kilobytes(result.value.bytes ?? 0)
          }),
          missing.length > 0 ? t('share.dialog.savedWithout', { names: missing.join(', ') }) : ''
        ]
          .join(' ')
          .trim()
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('share.errors.notSaved'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalDialog
      label={t('share.dialog.saveTitle')}
      className="w-[34rem] space-y-3 p-4"
      dismissible={!busy}
      onClose={onClose}
    >
      <h2 className="text-sm font-semibold text-foreground">{t('share.dialog.saveTitle')}</h2>
      <p className="text-muted-foreground">{t('share.dialog.intro')}</p>
      <label className="block space-y-1 text-muted-foreground">
        <span>{t('device.infoPage.name')}</span>
        <input
          className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
          disabled={busy || saved !== undefined}
          maxLength={MAXIMUM_TEMPLATE_NAME}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && valid && !busy && !saved) void save()
          }}
        />
      </label>
      <label className="block space-y-1 text-muted-foreground">
        <span>{t('templates.saveToTemplates.descriptionOptional')}</span>
        <input
          className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
          disabled={busy || saved !== undefined}
          maxLength={MAXIMUM_TEMPLATE_DESCRIPTION}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {summary ? <ShareSummary summary={summary} /> : null}
      {error ? <p className="text-red-400">{error}</p> : null}
      {saved ? <p className="text-emerald-400">{saved}</p> : null}
      <div className="flex justify-end gap-2 pt-1">
        {saved ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="outline" disabled={busy} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button disabled={busy || !valid || !draft} onClick={() => void save()}>
              {busy ? t('share.dialog.saving') : t('share.dialog.saveFile')}
            </Button>
          </>
        )}
      </div>
    </ModalDialog>
  )
}

function ShareSummary({ summary }: { summary: DashboardShareSummary }): React.JSX.Element {
  const images = summary.images.filter((image) => image.included).length
  const missingImages = summary.images.filter((image) => !image.included).map((image) => image.id)
  const count = (source: string): number => summary.fonts.filter((font) => font.source === source).length
  const missingFonts = summary.fonts.filter((font) => font.source === 'missing').map((font) => font.id)
  return (
    <div className="space-y-1 rounded-md border bg-muted/20 p-2 text-[11px] text-muted-foreground">
      <p>{t('share.summary.images', { count: images })}</p>
      <p>
        {t('share.summary.fonts', {
          embedded: count('embedded'),
          google: count('google'),
          builtin: count('builtin')
        })}
      </p>
      <p>{t('share.summary.size', { size: kilobytes(summary.estimatedBytes) })}</p>
      {missingImages.length > 0 ? (
        <p className="text-amber-400">{t('share.summary.missingImages', { images: missingImages.join(', ') })}</p>
      ) : null}
      {missingFonts.length > 0 ? (
        <p className="text-amber-400">{t('share.summary.missingFonts', { fonts: missingFonts.join(', ') })}</p>
      ) : null}
    </div>
  )
}

function defaultName(fileName: string | undefined): string {
  const base = withoutExtension(fileName ?? '').trim()
  return base && base !== withoutExtension(DEFAULT_CONFIGURATION_FILE_NAME)
    ? base.slice(0, MAXIMUM_TEMPLATE_NAME)
    : t('share.dialog.defaultName')
}

function withoutExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}
