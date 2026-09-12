import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ModalDialog } from '@/components/ui/modal-dialog'
import {
  absolutePlacement,
  selectedWidget,
  useDashboardEditorStore
} from '@/features/configuration/dashboard-editor'
import { draftText, useDeviceStore } from '@/features/device/device-store'
import {
  MAXIMUM_TEMPLATE_DESCRIPTION,
  MAXIMUM_TEMPLATE_NAME,
  templateIdFor,
  type TemplateKind
} from '@shared/templates'
import { screensOf } from '@shared/configuration-access'
import { BOARD_PROFILES, type DeviceConfiguration } from '@shared/device'
import { ScreenGallery } from './ScreenGallery'
import { useTemplatesStore } from './templates-store'
import { WidgetThumbnail } from './WidgetThumbnail'
import { t } from '@shared/ui-text'

export function SaveToTemplatesButton(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  return (
    <>
      <Button
        variant="outline"
        disabled={!hasLocalDraft}
        title={t('templates.saveToTemplates.keepThisDashboardOrThe')}
        onClick={() => setOpen(true)}
      >
        {t('templates.dashboardSection.saveToTemplates')}</Button>
      {open ? <SaveToTemplatesDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function SaveToTemplatesDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const draft = useDeviceStore((state) => state.draft)
  const selection = useDashboardEditorStore((state) => state.selection)
  const refresh = useTemplatesStore((state) => state.refresh)
  const library = useTemplatesStore((state) => state.library)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const widget = selectedWidget(draft, selection)
  const box =
    selection?.type === 'widget' ? absolutePlacement(draft, selection.id) : undefined
  const kind: TemplateKind = widget && box ? 'widget' : 'dashboard'
  const id = templateIdFor(name.trim())
  const draftDisplay = draft ? BOARD_PROFILES[draft.board]?.display : undefined

  const save = async (): Promise<void> => {
    if (!draft || !id) return
    const existing =
      kind === 'dashboard'
        ? library?.dashboards.some((entry) => entry.origin === 'user' && entry.id === id)
        : library?.widgets.some((entry) => entry.id === id)
    if (existing && !window.confirm(t('templates.saveToTemplates.replaceTheSavedKindId', { kind: kind, id: id }))) return

    setBusy(true)
    setError(undefined)
    try {
      const trimmed = description.trim()
      const result = await window.pitrig.saveTemplate(
        kind === 'dashboard'
          ? {
              kind: 'dashboard',
              name: name.trim(),
              ...(trimmed ? { description: trimmed } : {}),
              json: draftText({ draft })
            }
          : {
              kind: 'widget',
              name: name.trim(),
              ...(trimmed ? { description: trimmed } : {}),
              board: draft.board,
              json: JSON.stringify({ ...widget, placement: box })
            }
      )
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      await refresh()
      onClose()
    } catch (bridgeError) {
      setError(bridgeError instanceof Error ? bridgeError.message : t('templates.saveToTemplates.theTemplateWasNotSaved'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalDialog
      label={t('templates.dashboardSection.saveToTemplates')}
      className="w-[34rem] space-y-3 p-4"
      dismissible={!busy}
      onClose={onClose}
    >
        <h2 className="text-sm font-semibold text-foreground">{t('templates.dashboardSection.saveToTemplates')}</h2>

        <div className="flex gap-3">
          <div className="group h-32 w-48 flex-none overflow-hidden rounded border bg-black/40 p-1.5">
            {kind === 'widget' && widget && box ? (
              <WidgetThumbnail widget={{ ...widget, placement: box }} className="size-full" />
            ) : draft && draftDisplay ? (
              <ScreenGallery screens={screensOf(draft)} display={draftDisplay} />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <label className="block space-y-1 text-muted-foreground">
              <span>{t('device.infoPage.name')}</span>
              <input
                className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                disabled={busy}
                maxLength={MAXIMUM_TEMPLATE_NAME}
                placeholder={kind === 'widget' ? t('templates.saveToTemplates.rPMGauge') : t('templates.saveToTemplates.enduranceLayout')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && id && !busy) void save()
                }}
              />
            </label>
            <label className="block space-y-1 text-muted-foreground">
              <span>{t('templates.saveToTemplates.descriptionOptional')}</span>
              <input
                className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                disabled={busy}
                maxLength={MAXIMUM_TEMPLATE_DESCRIPTION}
                placeholder={
                  kind === 'widget'
                    ? t('templates.saveToTemplates.greenBelow6000RedAbove')
                    : t('templates.saveToTemplates.fuelAndTyresForLong')
                }
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <p className="text-muted-foreground">
              {kind === 'widget'
                ? widget && countsAsGroup(widget)
                  ? t('templates.saveToTemplates.theSelectedWidgetAndEverything', {
                      width: box?.width ?? 0,
                      height: box?.height ?? 0
                    })
                  : t('templates.saveToTemplates.theSelectedWidgetGoesTo', {
                      width: box?.width ?? 0,
                      height: box?.height ?? 0
                    })
                : t('templates.saveToTemplates.theWholeDashboardGoesTo', { draft: screenSummary(draft) })}
            </p>
          </div>
        </div>

        {error ? <p className="text-red-400">{error}</p> : null}
        {name.trim().length > 0 && !id ? (
          <p className="text-amber-400">{t('templates.saveToTemplates.aNameNeedsAtLeast')}</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t('common.cancel')}</Button>
          <Button disabled={busy || !id} onClick={() => void save()}>
            {busy ? t('device.saveToBoardUi.saving') : t('common.save')}
          </Button>
        </div>
    </ModalDialog>
  )
}

function screenSummary(draft: DeviceConfiguration | undefined): string {
  const screens = Math.max(screensOf(draft).length, 1)
  return screens === 1
    ? 'its one screen and everything on it'
    : `all ${screens} screens and everything on them`
}

function countsAsGroup(widget: { type: string }): boolean {
  return widget.type === 'shape' || widget.type === 'slot'
}
