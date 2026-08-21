import { LayoutTemplate, Plus, Shapes, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, PageSection, PageShell } from '@/app/workspace/PageShell'
import { useWorkspaceStore } from '@/app/workspace/workspace-store'
import { transferReportLines } from '@/features/configuration/transfer-report'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { useEditorPanelStore } from '@/features/configuration/editor/panel-store'
import { useDeviceStore } from '@/features/device/device-store'
import {
  collectFontRequirements,
  missingFontFamilies
} from '@/features/font-library/font-requirements'
import { useFontFaceStore } from '@/features/font-library/font-face-store'
import { documentFonts } from '@shared/document-fonts'
import { withWidgetIds } from '@shared/configuration-access'
import { validateConfigurationDocument } from '@shared/configuration-validate'
import {
  applyBoardTransportDefaults,
  SIMCORE_BOARD_IDS,
  type DeviceConfiguration
} from '@shared/device'
import { transferConfiguration, type LayoutTransferResult } from '@shared/layout-transfer'
import { displaySize } from '@/features/configuration/board-labels'
import type { DashboardTemplateSummary, WidgetTemplateSummary } from '@shared/templates'
import { DashboardThumbnail } from './DashboardThumbnail'
import { TemplateCard } from './TemplateCard'
import { useInsertScreenStore } from './insert-screen-store'
import { NO_TEMPLATES, useTemplatesStore } from './templates-store'
import { WidgetThumbnail } from './WidgetThumbnail'

/**
 * The library, in two halves.
 *
 * A **dashboard** answers "what am I starting from" — it replaces the whole
 * draft, and one authored for another display is scaled to the board in hand on
 * the way in, by the same engine the Configs page's Convert uses. A **widget**
 * answers "what am I building with" — it is placed onto the dashboard already
 * open, and changes nothing else about it.
 *
 * Neither is saved from here any more: saving is an act on what is on the
 * canvas, so it lives beside Save to board where the canvas is.
 */
export function TemplatesPage(): React.JSX.Element {
  const library = useTemplatesStore((state) => state.library)
  const loading = useTemplatesStore((state) => state.loading)
  const error = useTemplatesStore((state) => state.error)
  const setError = useTemplatesStore((state) => state.setError)
  const refresh = useTemplatesStore((state) => state.refresh)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Every card draws itself, so the faces the library names have to be loaded —
  // the canvas only ever asks for the ones the open document uses. Both halves
  // count: the widget entries, which arrive with the listing, and whichever
  // dashboards have been read for their preview.
  const ensureFaces = useFontFaceStore((state) => state.ensureFaces)
  const documents = useTemplatesStore((state) => state.documents)
  const entryFamilies = [
    ...(library?.widgets ?? []).map(
      (entry) =>
        ({ dashboard: { screens: [{ widgets: [entry.widget] }] } }) as DeviceConfiguration
    ),
    ...Object.values(documents).filter(
      (document): document is DeviceConfiguration => typeof document === 'object'
    )
  ]
    .flatMap((document) => documentFonts(document))
    .map((font) => font?.family)
    .filter((family): family is string => Boolean(family))
  const familyKey = [...new Set(entryFamilies)].sort().join(' ')
  useEffect(() => {
    void ensureFaces(familyKey ? familyKey.split(' ') : [])
  }, [ensureFaces, familyKey])

  const remove = async (
    entry: DashboardTemplateSummary | WidgetTemplateSummary
  ): Promise<void> => {
    if (!window.confirm(`Delete the saved ${entry.kind} "${entry.name}"?`)) return
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const result = await window.simcore.deleteTemplate({ id: entry.id, kind: entry.kind })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setNotice(`"${entry.name}" deleted.`)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <DashboardSection
        busy={busy}
        setBusy={setBusy}
        onNotice={setNotice}
        onDelete={(entry) => void remove(entry)}
      />
      <WidgetSection busy={busy} onDelete={(entry) => void remove(entry)} />

      {loading && !library ? (
        <p className="text-xs text-muted-foreground">Reading the library…</p>
      ) : null}
      {library && library.unreadable > 0 ? (
        <p className="text-[11px] text-amber-400">
          {`${library.unreadable} file${library.unreadable === 1 ? '' : 's'} in the template folder could not be read.`}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
          {notice}
        </p>
      ) : null}
    </PageShell>
  )
}

function DashboardSection({
  busy,
  setBusy,
  onNotice,
  onDelete
}: {
  busy: boolean
  setBusy: (busy: boolean) => void
  onNotice: (notice: string) => void
  onDelete: (entry: DashboardTemplateSummary) => void
}): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const replaceLocalDraft = useDeviceStore((state) => state.replaceLocalDraft)
  const resetEditorState = useDashboardEditorStore((state) => state.resetEditorState)
  const setError = useTemplatesStore((state) => state.setError)
  const templates = useTemplatesStore((state) => state.library ?? NO_TEMPLATES).dashboards
  const fit = useEditorPanelStore((state) => state.transferFit)
  const openPicker = useInsertScreenStore((state) => state.openPicker)
  const [report, setReport] = useState<LayoutTransferResult>()
  const [missing, setMissing] = useState<readonly string[]>([])

  const targetBoard = session?.info.boardId ?? draft?.board

  // `Use` is the destructive one, and the only one: it replaces every screen
  // and everything on them. `Add` takes screens without touching what is open,
  // which is why the two are separate buttons rather than one that behaves
  // differently depending on what you already have.
  const use = async (summary: DashboardTemplateSummary): Promise<void> => {
    if (
      hasLocalDraft &&
      !window.confirm(
        `Replace everything you have open with "${summary.name}"? Every screen and every widget in the current draft is discarded.`
      )
    ) {
      return
    }
    setBusy(true)
    setError(undefined)
    setReport(undefined)
    setMissing([])
    try {
      const result = await window.simcore.readTemplate({ id: summary.id, kind: 'dashboard' })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (result.value.format !== 'simcore-dashboard-template') {
        setError('That entry is not a dashboard.')
        return
      }
      // The connected board first, then whatever the draft already targets —
      // so the library works the same disconnected as it does plugged in.
      const board = session?.info.boardId ?? draft?.board ?? result.value.configuration.board
      const transferred = transferConfiguration(result.value.configuration, {
        board,
        display: session?.info.display,
        fit
      })
      setReport(transferred)
      // Draft transport first, then the template's, then whatever the target
      // board cannot leave to the contract default.
      const adopted = applyBoardTransportDefaults(
        withWidgetIds(keepDraftTransport(transferred.configuration, draft))
      )
      const validated = validateConfigurationDocument(adopted, {
        supportedBoards: SIMCORE_BOARD_IDS
      })
      if (!validated.ok) {
        setError(
          `"${summary.name}" would not be accepted on this board, so the draft was left alone. ${validated.error}`
        )
        return
      }
      replaceLocalDraft(validated.configuration)
      // A different document is a different set of widgets, so nothing the
      // editor was pointing at describes anything any more.
      resetEditorState()
      setMissing(
        missingFontFamilies(
          collectFontRequirements(validated.configuration),
          session?.fontAssets?.families ?? []
        )
      )
      onNotice(`"${summary.name}" is now the local draft.`)
    } catch (bridgeError) {
      setError(bridgeError instanceof Error ? bridgeError.message : 'Failed to apply the template.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageSection
      title="Dashboards"
      description={
        targetBoard
          ? `Whole layouts, scaled to ${displaySize(targetBoard) ?? targetBoard} on the way in. Add takes screens from one; Use replaces what you have open.`
          : 'Whole layouts. Add takes screens from one; Use replaces what you have open.'
      }
    >
      {templates.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate aria-hidden="true" className="size-6" />}
          title="No dashboards"
        >
          Save the dashboard you are working on with <b>Save to templates</b> on the canvas, and it
          will be here next time.
        </EmptyState>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {templates.map((summary) => (
            <TemplateCard
              key={summary.id}
              name={summary.name}
              description={summary.description}
              meta={`${summary.screenCount} screen${summary.screenCount === 1 ? '' : 's'} · ${summary.widgetCount} widget${summary.widgetCount === 1 ? '' : 's'}`}
              preview={<DashboardThumbnail id={summary.id} board={summary.board} />}
              badges={
                <>
                  {summary.origin === 'bundled' ? (
                    <Badge
                      className="flex-none border-zinc-500/40 bg-zinc-500/15 text-zinc-300"
                      variant="outline"
                    >
                      Starter
                    </Badge>
                  ) : null}
                  <Badge className="flex-none" variant="outline" title={summary.board}>
                    {displaySize(summary.board) ?? summary.board}
                  </Badge>
                </>
              }
              actions={
                <>
                  <Button
                    className="h-7 px-2"
                    variant="outline"
                    disabled={busy || !hasLocalDraft}
                    title={
                      hasLocalDraft
                        ? 'Add screens from this template to the dashboard you have open'
                        : 'Open a dashboard first — there is nothing to add screens to'
                    }
                    onClick={() => openPicker(summary)}
                  >
                    <Plus aria-hidden="true" className="mr-1 size-3.5" />
                    Add
                  </Button>
                  <Button
                    className="h-7 px-2"
                    variant="outline"
                    disabled={busy}
                    title="Replace everything you have open with this template"
                    onClick={() => void use(summary)}
                  >
                    Use
                  </Button>
                  {summary.origin === 'user' ? (
                    <Button
                      aria-label={`Delete ${summary.name}`}
                      className="h-7 px-2 text-red-400 hover:text-red-300"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onDelete(summary)}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </Button>
                  ) : null}
                </>
              }
            />
          ))}
        </ul>
      )}

      {missing.length > 0 ? (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-300">
          {`Needs font famil${missing.length === 1 ? 'y' : 'ies'} not installed on the board: ${missing.join(', ')}. Choose a source on the Fonts page; saving to the board uploads them.`}
        </p>
      ) : null}
      {report ? (
        <div className="mt-3 space-y-1 rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-[11px] text-sky-200">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">Layout transfer</span>
            <button
              className="text-sky-300/70 hover:text-sky-200"
              type="button"
              onClick={() => setReport(undefined)}
            >
              Dismiss
            </button>
          </div>
          <ul className="list-disc space-y-0.5 pl-4">
            {transferReportLines(report).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </PageSection>
  )
}

/**
 * Parts of dashboards, for reuse inside one.
 *
 * Pressing Add does not drop the widget somewhere and leave the author to find
 * it: it hands the fragment to the canvas, which then follows the pointer with
 * it until a click says where it goes.
 */
function WidgetSection({
  busy,
  onDelete
}: {
  busy: boolean
  onDelete: (entry: WidgetTemplateSummary) => void
}): React.JSX.Element {
  const widgets = useTemplatesStore((state) => state.library ?? NO_TEMPLATES).widgets
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const beginInsert = useDashboardEditorStore((state) => state.beginInsert)
  const setDashboardView = useWorkspaceStore((state) => state.setDashboardView)

  const add = (entry: WidgetTemplateSummary): void => {
    beginInsert({ widget: entry.widget, label: entry.name })
    setDashboardView('canvas')
  }

  return (
    <PageSection
      title="Widgets"
      description="Parts of a dashboard kept for reuse. A container brings everything inside it."
    >
      {widgets.length === 0 ? (
        <EmptyState icon={<Shapes aria-hidden="true" className="size-6" />} title="No widgets">
          Select a widget on the canvas and press <b>Save to templates</b>. A container saves its
          whole cluster, which is how a rev-counter with its lights becomes one entry.
        </EmptyState>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {widgets.map((entry) => (
            <TemplateCard
              key={entry.id}
              name={entry.name}
              description={entry.description}
              meta={`${entry.width} × ${entry.height}${entry.widgetCount > 1 ? ` · ${entry.widgetCount} widgets` : ''}`}
              preview={<WidgetThumbnail widget={entry.widget} className="size-full" />}
              actions={
                <>
                  <Button
                    className="h-7 px-2"
                    variant="outline"
                    disabled={busy || !hasLocalDraft}
                    title={
                      hasLocalDraft
                        ? 'Place this on the canvas'
                        : 'Open a dashboard first — there is nothing to place it on'
                    }
                    onClick={() => add(entry)}
                  >
                    <Plus aria-hidden="true" className="mr-1 size-3.5" />
                    Add
                  </Button>
                  <Button
                    aria-label={`Delete ${entry.name}`}
                    className="h-7 px-2 text-red-400 hover:text-red-300"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onDelete(entry)}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  </Button>
                </>
              }
            />
          ))}
        </ul>
      )}
    </PageSection>
  )
}

/**
 * Telemetry transport is device wiring — a UART port, its pins, its baud rate —
 * rather than layout, so a template must not bring another machine's pin map
 * with it. What the draft already says about its own wiring wins; a template's
 * transport is taken only when the draft names none.
 */
function keepDraftTransport(
  configuration: DeviceConfiguration,
  draft: DeviceConfiguration | undefined
): DeviceConfiguration {
  return draft?.telemetry_transport
    ? { ...configuration, telemetry_transport: draft.telemetry_transport }
    : configuration
}
