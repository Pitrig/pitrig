import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PageShellProps {
  title?: string
  description?: ReactNode
  actions?: ReactNode
  fill?: boolean
  children: ReactNode
}

export function PageShell({
  title,
  description,
  actions,
  fill = false,
  children
}: PageShellProps): React.JSX.Element {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {title ? (
        <header className="flex flex-none items-start justify-between gap-4 border-b px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-none items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {fill ? (
        <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 p-5">{children}</div>
        </div>
      )}
    </div>
  )
}

interface PageSectionProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  collapsible?: boolean
  className?: string
  children: ReactNode
}

export function PageSection({
  title,
  description,
  actions,
  collapsible = false,
  className,
  children
}: PageSectionProps): React.JSX.Element {
  const frame = 'rounded-xl border bg-card text-card-foreground shadow-sm'
  const header = (
    <>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-none tracking-tight">{title}</h3>
        {description ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div
          className="flex flex-none items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
    </>
  )
  const body = <div className={cn('px-4 pb-4 text-xs', className)}>{children}</div>

  if (collapsible) {
    return (
      <details className={frame}>
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 pt-4 pb-3">
          {header}
        </summary>
        {body}
      </details>
    )
  }
  return (
    <section className={frame}>
      <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-3">{header}</div>
      {body}
    </section>
  )
}

export function ReadOnlyField({
  label,
  value,
  title
}: {
  label: string
  value: string
  title?: string
}): React.JSX.Element {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate rounded-md border bg-muted/40 px-2 py-1.5" title={title ?? value}>
        {value}
      </span>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      {children ? (
        <div className="max-w-md text-xs leading-5 text-muted-foreground">{children}</div>
      ) : null}
    </div>
  )
}
