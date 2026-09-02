import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { InfoHint } from './InfoHint'
import { useEditorPanelStore } from '../editor/panel-store'
import { t } from '@shared/ui-text'

export function Group({
  id,
  title,
  icon: Icon,
  summary,
  hint,
  defaultOpen = true,
  children
}: {
  id: string
  title: string
  icon: LucideIcon
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
        <span>{t('inspector.group.advanced')}</span>
        {!open && active ? <span className="ml-auto text-[10px]">{t('inspector.group.set')}</span> : null}
      </button>
      {open ? <div className="space-y-2 px-2 pb-2">{children}</div> : null}
    </div>
  )
}
