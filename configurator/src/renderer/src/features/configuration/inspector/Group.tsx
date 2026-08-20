import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { InfoHint } from './InfoHint'
import { useEditorPanelStore } from '../editor/panel-store'

/**
 * A folding group of properties.
 *
 * The fold is remembered by name rather than by widget: an author who never
 * touches borders wants "Box" folded for every widget, not for the one that
 * happened to be selected. The summary on the right is what makes folding
 * cheap — a folded group still says what is inside it, so nothing has to be
 * opened just to find out whether it holds anything.
 */

export function Group({
  id,
  title,
  icon: Icon,
  summary,
  hint,
  defaultOpen = true,
  children
}: {
  /** Stable across widget types: the fold is global by this key. */
  id: string
  title: string
  icon: LucideIcon
  /** What is inside, shown while folded. */
  summary?: string
  hint?: string
  defaultOpen?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const stored = useEditorPanelStore((state) => state.groups[id])
  const setGroupOpen = useEditorPanelStore((state) => state.setGroupOpen)
  const open = stored ?? defaultOpen
  return (
    <section className="border-t first:border-t-0">
      <div className="flex items-center gap-1.5 py-2">
        <button
          type="button"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => setGroupOpen(id, !open)}
        >
          {open ? (
            <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-none font-medium">{title}</span>
          {summary ? (
            <span className="min-w-0 flex-1 truncate text-right text-muted-foreground" title={summary}>
              {summary}
            </span>
          ) : null}
        </button>
        {hint ? <InfoHint text={hint} label={title} /> : null}
      </div>
      {open ? <div className="space-y-2 pb-3">{children}</div> : null}
    </section>
  )
}

/**
 * The tail of a group: the properties that exist for the one dashboard that
 * needs them and are noise on every other. Folded unless the document already
 * carries one of them — hiding a value somebody set is worse than showing a
 * default nobody wanted.
 */
export function Advanced({
  id,
  active,
  children
}: {
  id: string
  active: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const stored = useEditorPanelStore((state) => state.groups[`${id}/advanced`])
  const setGroupOpen = useEditorPanelStore((state) => state.setGroupOpen)
  const open = stored ?? active
  return (
    <div className="rounded-md border">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-2 py-1 text-left text-muted-foreground hover:text-foreground"
        onClick={() => setGroupOpen(`${id}/advanced`, !open)}
      >
        {open ? (
          <ChevronDown aria-hidden className="size-3 shrink-0" />
        ) : (
          <ChevronRight aria-hidden className="size-3 shrink-0" />
        )}
        <span>Advanced</span>
        {!open && active ? <span className="ml-auto text-[10px]">set</span> : null}
      </button>
      {open ? <div className="space-y-2 px-2 pb-2">{children}</div> : null}
    </div>
  )
}
