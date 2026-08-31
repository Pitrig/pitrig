import type { ReactNode } from 'react'

export const TOOLBAR_ITEM = 'flex h-6 items-center rounded-md hover:bg-muted'
export const TOOLBAR_ITEM_ACTIVE = 'bg-muted font-medium text-foreground'
export const TOOLBAR_GHOST = 'flex h-6 items-center rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground'

export function ToolbarGroup({
  label,
  children
}: {
  label: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-muted/20 p-0.5">
      <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

export function ToolbarDivider(): React.JSX.Element {
  return <span aria-hidden className="mx-0.5 h-3.5 w-px flex-none bg-border" />
}
