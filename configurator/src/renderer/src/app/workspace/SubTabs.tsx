import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface SubTab<Id extends string> {
  id: Id
  label: string
  icon?: LucideIcon
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
