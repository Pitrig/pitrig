import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { screensOf, screenWidgetsOf } from '@shared/configuration-access'
import { MAXIMUM_SCREENS } from '@shared/configuration-schema'
import { BOARD_PROFILES, type DeviceConfiguration } from '@shared/device'
import { TEMPLATE_FORMAT, type DashboardTemplateSummary } from '@shared/templates'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { useEditorPanelStore } from '@/features/configuration/editor/panel-store'
import { displaySize } from '@/features/configuration/board-labels'
import { useDeviceStore } from '@/features/device/device-store'
import { insertScreenFromDocument } from './insert-screen'
import { useInsertScreenStore } from './insert-screen-store'
import { ScreenView } from './ScreenGallery'
import { NO_TEMPLATES, useTemplatesStore } from './templates-store'
import { t } from '@shared/ui-text'

export function InsertScreenDialog(): React.JSX.Element | null {
  const open = useInsertScreenStore((state) => state.open)
  const preselected = useInsertScreenStore((state) => state.template)
  const close = useInsertScreenStore((state) => state.close)
  const dashboards = useTemplatesStore((state) => state.library ?? NO_TEMPLATES).dashboards
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const fit = useEditorPanelStore((state) => state.transferFit)
  const setActiveScreen = useDashboardEditorStore((state) => state.setActiveScreen)
  const [chosen, setChosen] = useState<DashboardTemplateSummary>()
  const [document, setDocument] = useState<DeviceConfiguration>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!open || !preselected) return
    void choose(preselected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselected?.id])

  if (!open) return null

  const dismiss = (): void => {
    setChosen(undefined)
    setDocument(undefined)
    setError(undefined)
    close()
  }

  async function choose(summary: DashboardTemplateSummary): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      const result = await window.pitrig.readTemplate({ id: summary.id, kind: 'dashboard' })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (result.value.format !== TEMPLATE_FORMAT) {
        setError(t('templates.dashboardSection.thatEntryIsNotA'))
        return
      }
      setChosen(summary)
      setDocument(result.value.configuration)
    } finally {
      setBusy(false)
    }
  }

  const take = (indices: readonly number[]): void => {
    if (!document || !draft) return
    const room = MAXIMUM_SCREENS - Math.max(screensOf(draft).length, 1)
    if (indices.length > room) {
      setError(
        room === 0
          ? t('templates.insertScreenDialog.thisDashboardAlreadyHoldsMaximum', { mAXIMUM_SCREENS: MAXIMUM_SCREENS })
          : `Only ${room} more screen${room === 1 ? '' : 's'} fit; that would add ${indices.length}.`
      )
      return
    }
    for (const index of indices) {
      const result = insertScreenFromDocument(document, index, {
        board: draft.board,
        display: session?.info.display,
        fit
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setActiveScreen(result.index)
    }
    dismiss()
  }

  const screens = document ? screensOf(document) : []
  const display = chosen ? BOARD_PROFILES[chosen.board]?.display : undefined

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) dismiss()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('templates.insertScreenDialog.addAScreen')}
        className="flex max-h-[34rem] w-[30rem] flex-col gap-3 rounded-lg border bg-background p-4 text-xs shadow-lg"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">
            {chosen ? t('templates.insertScreenDialog.screensInName', { name: chosen.name }) : t('templates.insertScreenDialog.addAScreen')}
          </h2>
          <p className="text-muted-foreground">
            {chosen
              ? t('templates.insertScreenDialog.addedAtTheEndNothing')
              : t('templates.insertScreenDialog.pickTheDashboardToTake')}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {!chosen ? (
            <>
              {dashboards.map((summary) => (
                <button
                  key={summary.id}
                  type="button"
                  disabled={busy}
                  className="flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left hover:bg-muted disabled:opacity-50"
                  onClick={() => void choose(summary)}
                >
                  <span className="min-w-0 truncate">{summary.name}</span>
                  <span className="flex-none text-[11px] text-muted-foreground">
                    {`${summary.screenCount} screen${summary.screenCount === 1 ? '' : 's'} · ${displaySize(summary.board) ?? summary.board}`}
                  </span>
                </button>
              ))}
              {dashboards.length === 0 ? (
                <p className="text-muted-foreground">{t('templates.insertScreenDialog.theLibraryHoldsNoDashboards')}</p>
              ) : null}
            </>
          ) : (
            <>
              {screens.length > 1 ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed px-2 py-2 text-left hover:bg-muted"
                  onClick={() => take(screens.map((_, index) => index))}
                >
                  <span>{t('templates.insertScreenDialog.allScreens')}</span>
                  <span className="flex-none text-[11px] text-muted-foreground">
                    {t('templates.insertScreenDialog.addsLength', { length: screens.length })}
                  </span>
                </button>
              ) : null}
              {display
                ? screens.map((screen, index) => (
                    <button
                      key={screen.id ?? index}
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-md border p-2 text-left hover:bg-muted"
                      onClick={() => take([index])}
                    >
                      <span className="h-16 w-24 flex-none overflow-hidden rounded border bg-black/40 p-1">
                        <ScreenView screen={screen} display={display} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{screen.id ?? `screen${index + 1}`}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {t('templates.insertScreenDialog.lengthWidgets', { length: screenWidgetsOf(screen).length })}
                        </span>
                      </span>
                    </button>
                  ))
                : null}
              {busy ? <p className="text-muted-foreground">{t('templates.dashboardThumbnail.reading')}</p> : null}
            </>
          )}
        </div>

        {error ? <p className="text-red-400">{error}</p> : null}

        <div className="flex justify-between gap-2">
          {chosen && !preselected ? (
            <Button variant="outline" onClick={() => setChosen(undefined)}>
              {t('templates.insertScreenDialog.back')}</Button>
          ) : (
            <span />
          )}
          <Button variant="outline" onClick={dismiss}>
            {t('common.cancel')}</Button>
        </div>
      </div>
    </div>
  )
}
