import { useState } from 'react'

import { Button } from '@/components/ui/button'
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

export function SaveToTemplatesButton(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  return (
    <>
      <Button
        variant="outline"
        disabled={!hasLocalDraft}
        title="Keep this dashboard, or the selected widget, in the template library"
        onClick={() => setOpen(true)}
      >
        Save to templates
      </Button>
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
    if (existing && !window.confirm(`Replace the saved ${kind} "${id}"?`)) return

    setBusy(true)
    setError(undefined)
    try {
      const trimmed = description.trim()
      const result = await window.simcore.saveTemplate(
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
      setError(bridgeError instanceof Error ? bridgeError.message : 'The template was not saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save to templates"
        className="w-[34rem] space-y-3 rounded-lg border bg-background p-4 text-xs shadow-lg"
      >
        <h2 className="text-sm font-semibold text-foreground">Save to templates</h2>

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
              <span>Name</span>
              <input
                autoFocus
                className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                disabled={busy}
                maxLength={MAXIMUM_TEMPLATE_NAME}
                placeholder={kind === 'widget' ? 'RPM gauge' : 'Endurance layout'}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && id && !busy) void save()
                }}
              />
            </label>
            <label className="block space-y-1 text-muted-foreground">
              <span>Description (optional)</span>
              <input
                className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                disabled={busy}
                maxLength={MAXIMUM_TEMPLATE_DESCRIPTION}
                placeholder={
                  kind === 'widget'
                    ? 'Green below 6000, red above'
                    : 'Fuel and tyres for long runs'
                }
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <p className="text-muted-foreground">
              {kind === 'widget'
                ? `The selected widget${widget && countsAsGroup(widget) ? ' and everything inside it' : ''} goes to the widget library, at ${box?.width} × ${box?.height}.`
                : `The whole dashboard goes to the dashboard library — ${screenSummary(draft)}.`}
            </p>
          </div>
        </div>

        {error ? <p className="text-red-400">{error}</p> : null}
        {name.trim().length > 0 && !id ? (
          <p className="text-amber-400">A name needs at least one letter or digit.</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !id} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
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
