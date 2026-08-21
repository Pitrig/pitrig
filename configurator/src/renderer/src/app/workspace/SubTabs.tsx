import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The strip of pages inside one workspace, with whatever belongs to the
 * workspace as a whole on the right of it.
 *
 * Only the dashboard has one today. It is a component rather than markup in
 * that page so a second workspace that grows pages does not invent a second
 * look for the same idea.
 */

export interface SubTab<Id extends string> {
  id: Id
  label: string
  icon?: LucideIcon
  /** A count or a warning dot's worth of state, shown after the label. */
  badge?: ReactNode
}

interface SubTabsProps<Id extends string> {
  label: string
  tabs: ReadonlyArray<SubTab<Id>>
  value: Id
  onChange: (id: Id) => void
  actions?: ReactNode
}

export function SubTabs<Id extends string>({
  label,
  tabs,
  value,
  onChange,
  actions
}: SubTabsProps<Id>): React.JSX.Element {
  return (
    // The tabs keep their width and the actions give theirs up. It was the
    // other way round — `min-w-0` on the tabs, `flex-none` on the actions — and
    // a long live-apply message then shrank the tab list below its own content
    // and painted straight over it.
    <div className="flex h-11 flex-none items-center gap-4 border-b px-3">
      <div aria-label={label} className="flex flex-none items-center gap-1" role="tablist">
        {tabs.map((tab) => {
          const active = tab.id === value
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
              onClick={() => onChange(tab.id)}
            >
              {tab.icon ? <tab.icon aria-hidden="true" className="size-3.5" /> : null}
              <span>{tab.label}</span>
              {tab.badge}
            </button>
          )
        })}
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
