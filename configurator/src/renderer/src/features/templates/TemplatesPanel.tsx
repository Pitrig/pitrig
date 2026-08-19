import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { transferReportLines } from '@/features/configuration/transfer-report'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { draftText, useDeviceStore } from '@/features/device/device-store'
import {
  collectFontRequirements,
  missingFontFamilies
} from '@/features/font-library/font-requirements'
import { withWidgetIds } from '@shared/configuration-access'
import { validateConfigurationDocument } from '@shared/configuration-validate'
import {
  applyBoardTransportDefaults,
  BOARD_PROFILES,
  SIMCORE_BOARD_IDS,
  type DeviceConfiguration
} from '@shared/device'
import { transferConfiguration, type LayoutFit, type LayoutTransferResult } from '@shared/layout-transfer'
import {
  MAXIMUM_TEMPLATE_DESCRIPTION,
  MAXIMUM_TEMPLATE_NAME,
  templateIdFor,
  type DashboardTemplateSummary
} from '@shared/templates'
import { useTemplatesStore } from './templates-store'

// Whole dashboards to start from: the starters that ship with the application
// and whatever the author has saved. A template authored for another board is
// not refused — it is scaled to the board in hand on the way in, by the same
// engine the configuration panel's Convert uses.

export function TemplatesPanel(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const draft = useDeviceStore((state) => state.draft)
  const rawDraft = useDeviceStore((state) => state.rawDraft)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const replaceLocalDraft = useDeviceStore((state) => state.replaceLocalDraft)
  const resetEditorState = useDashboardEditorStore((state) => state.resetEditorState)

  const library = useTemplatesStore((state) => state.library)
  const loading = useTemplatesStore((state) => state.loading)
  const error = useTemplatesStore((state) => state.error)
  const setError = useTemplatesStore((state) => state.setError)
  const refresh = useTemplatesStore((state) => state.refresh)

  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [report, setReport] = useState<LayoutTransferResult>()
  const [missing, setMissing] = useState<readonly string[]>([])
  const [fit, setFit] = useState<LayoutFit>('contain')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    void refresh()
  }, [refresh])

  const templates = library?.templates ?? []
  // The board a template is about to land on. Only when one was authored for a
  // different display does the fit matter, so that is when it is offered.
  const targetBoard = session?.info.boardId ?? draft?.board
  const anyRescaled = templates.some((entry) => entry.board !== targetBoard)

  const begin = (): void => {
    setError(undefined)
    setNotice(undefined)
    setReport(undefined)
    setMissing([])
  }

  const apply = async (summary: DashboardTemplateSummary): Promise<void> => {
    if (
      hasLocalDraft &&
      !window.confirm(`Discard the current local draft and apply "${summary.name}"?`)
    ) {
      return
    }
    setBusy(true)
    begin()
    try {
      const result = await window.simcore.readDashboardTemplate({ id: summary.id })
      if (!result.ok) {
        setError(result.error.message)
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
      setNotice(`"${summary.name}" applied as the local draft.`)
    } catch (bridgeError) {
      setError(bridgeError instanceof Error ? bridgeError.message : 'Failed to apply the template.')
    } finally {
      setBusy(false)
    }
  }

  const save = async (): Promise<void> => {
    const trimmed = name.trim()
    const id = templateIdFor(trimmed)
    const replaced = templates.find((entry) => entry.origin === 'user' && entry.id === id)
    if (replaced && !window.confirm(`Replace the saved template "${replaced.name}"?`)) return
    setBusy(true)
    begin()
    try {
      const result = await window.simcore.saveDashboardTemplate({
        name: trimmed,
        ...(description.trim() ? { description: description.trim() } : {}),
        json: draftText({ rawDraft, draft })
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setName('')
      setDescription('')
      setNotice(`Saved as "${result.value.name}".`)
      await refresh()
    } catch (bridgeError) {
      setError(bridgeError instanceof Error ? bridgeError.message : 'Failed to save the template.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (summary: DashboardTemplateSummary): Promise<void> => {
    if (!window.confirm(`Delete the saved template "${summary.name}"?`)) return
    setBusy(true)
    begin()
    try {
      const result = await window.simcore.deleteDashboardTemplate({ id: summary.id })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setNotice(`"${summary.name}" deleted.`)
      await refresh()
    } catch (bridgeError) {
      setError(
        bridgeError instanceof Error ? bridgeError.message : 'Failed to delete the template.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle>Templates</CardTitle>
        <CardDescription>
          Whole dashboards to start from. One authored for another board is scaled to fit this one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 text-xs">
        {loading && templates.length === 0 ? (
          <p className="text-muted-foreground">Reading the library…</p>
        ) : templates.length === 0 ? (
          <p className="text-muted-foreground">No templates.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((summary) => (
              <TemplateRow
                key={summary.id}
                busy={busy}
                summary={summary}
                onApply={() => void apply(summary)}
                onDelete={() => void remove(summary)}
              />
            ))}
          </div>
        )}

        {anyRescaled ? (
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>Fit a template built for another display</span>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              disabled={busy}
              value={fit}
              onChange={(event) => setFit(event.target.value as LayoutFit)}
            >
              <option value="contain">Keep proportions, centre</option>
              <option value="stretch">Stretch to fill the display</option>
            </select>
          </label>
        ) : null}

        {library && library.unreadable > 0 ? (
          <p className="text-amber-400">
            {`${library.unreadable} file${library.unreadable === 1 ? '' : 's'} in the template folder could not be read.`}
          </p>
        ) : null}

        <details className="rounded-md border">
          <summary className="cursor-pointer px-3 py-2 font-medium">
            Save current as template
          </summary>
          <div className="space-y-2 border-t p-2">
            <label className="block space-y-1 text-[11px] text-muted-foreground">
              <span>Name</span>
              <input
                className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                disabled={busy || !hasLocalDraft}
                maxLength={MAXIMUM_TEMPLATE_NAME}
                placeholder="Endurance layout"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="block space-y-1 text-[11px] text-muted-foreground">
              <span>Description (optional)</span>
              <input
                className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                disabled={busy || !hasLocalDraft}
                maxLength={MAXIMUM_TEMPLATE_DESCRIPTION}
                placeholder="Fuel and tyre readouts for long runs"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <Button
              className="w-full"
              variant="outline"
              disabled={busy || !hasLocalDraft || templateIdFor(name.trim()) === undefined}
              onClick={() => void save()}
            >
              Save template
            </Button>
            {!hasLocalDraft ? (
              <p className="text-[11px] text-muted-foreground">
                Create, load or read a configuration first.
              </p>
            ) : null}
          </div>
        </details>

        {error ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-red-300">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300">
            {notice}
          </p>
        ) : null}

        {missing.length > 0 ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-300">
            {`Needs font famil${missing.length === 1 ? 'y' : 'ies'} not installed on the board: ${missing.join(', ')}. Choose a source in Fonts; saving to the board uploads them.`}
          </p>
        ) : null}

        {report ? (
          <div className="space-y-1 rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-[11px] text-sky-200">
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
      </CardContent>
    </Card>
  )
}

function TemplateRow({
  summary,
  busy,
  onApply,
  onDelete
}: {
  summary: DashboardTemplateSummary
  busy: boolean
  onApply: () => void
  onDelete: () => void
}): React.JSX.Element {
  const display = BOARD_PROFILES[summary.board].display
  return (
    <div className="space-y-1 rounded-md border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium" title={summary.name}>
          {summary.name}
        </span>
        <div className="flex flex-none items-center gap-1">
          {summary.origin === 'bundled' ? (
            <Badge className="border-zinc-500/40 bg-zinc-500/15 text-zinc-300" variant="outline">
              Starter
            </Badge>
          ) : null}
          <Badge variant="outline" title={summary.board}>
            {`${display.width} × ${display.height}`}
          </Badge>
        </div>
      </div>
      {summary.description ? (
        <p className="truncate text-[11px] text-muted-foreground" title={summary.description}>
          {summary.description}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {`${summary.screenCount} screen${summary.screenCount === 1 ? '' : 's'} · ${summary.widgetCount} widget${summary.widgetCount === 1 ? '' : 's'}`}
        </span>
        <div className="flex flex-none gap-1">
          {summary.origin === 'user' ? (
            <Button
              className="h-7 px-2 text-red-400 hover:text-red-300"
              variant="outline"
              disabled={busy}
              onClick={onDelete}
            >
              Delete
            </Button>
          ) : null}
          <Button className="h-7 px-2" variant="outline" disabled={busy} onClick={onApply}>
            Apply
          </Button>
        </div>
      </div>
    </div>
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
