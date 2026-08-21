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

/**
 * Which screen to take, and out of which dashboard.
 *
 * Nothing here replaces anything: a screen arrives at the end of the dashboard
 * already open, and the one being worked on is untouched. That is the whole
 * difference between this and `Use`, and it is why a card offers both.
 *
 * A submenu would have been shorter, and it cannot be: a screen's name and what
 * is on it live in the document, and a summary deliberately does not carry four
 * of those per row. So the choice is made in two steps — the dashboard, then the
 * screen it turns out to hold — with the read in between. A card that already
 * knows which dashboard it means skips the first.
 */
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

  // A card names its template when it opens this, so the first step has already
  // been answered and reading it is the only thing left to do.
  useEffect(() => {
    if (!open || !preselected) return
    void choose(preselected)
    // choose is recreated per render and only ever reads the argument it is
    // given, so the identifier is what this actually depends on.
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
      const result = await window.simcore.readTemplate({ id: summary.id, kind: 'dashboard' })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (result.value.format !== TEMPLATE_FORMAT) {
        setError('That entry is not a dashboard.')
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
    // Refused whole rather than half: taking two of three screens and stopping
    // at the cap would leave a dashboard nobody asked for.
    const room = MAXIMUM_SCREENS - Math.max(screensOf(draft).length, 1)
    if (indices.length > room) {
      setError(
        room === 0
          ? `This dashboard already holds ${MAXIMUM_SCREENS} screens, which is all a board has.`
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
        aria-label="Add a screen"
        className="flex max-h-[34rem] w-[30rem] flex-col gap-3 rounded-lg border bg-background p-4 text-xs shadow-lg"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">
            {chosen ? `Screens in "${chosen.name}"` : 'Add a screen'}
          </h2>
          <p className="text-muted-foreground">
            {chosen
              ? 'Added at the end. Nothing already on this dashboard changes.'
              : 'Pick the dashboard to take a screen from.'}
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
                <p className="text-muted-foreground">The library holds no dashboards yet.</p>
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
                  <span>All screens</span>
                  <span className="flex-none text-[11px] text-muted-foreground">
                    {`adds ${screens.length}`}
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
                          {`${screenWidgetsOf(screen).length} widgets`}
                        </span>
                      </span>
                    </button>
                  ))
                : null}
              {busy ? <p className="text-muted-foreground">Reading…</p> : null}
            </>
          )}
        </div>

        {error ? <p className="text-red-400">{error}</p> : null}

        <div className="flex justify-between gap-2">
          {chosen && !preselected ? (
            <Button variant="outline" onClick={() => setChosen(undefined)}>
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" onClick={dismiss}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
