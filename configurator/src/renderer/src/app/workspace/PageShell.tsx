import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The chrome every workspace page shares: a title, a sentence saying what the
 * page is for, the actions that belong to it, and the body below.
 *
 * It exists so the seven pages read as one application rather than as seven
 * panels that happen to be in the same window. Nothing here decides what a page
 * holds — only where its heading, its actions and its scroll live.
 */

interface PageShellProps {
  title: string
  description?: ReactNode
  /** Buttons and status that belong to the page as a whole, shown top right. */
  actions?: ReactNode
  /**
   * Hands the whole area to the child, which then owns its own scrolling. The
   * canvas and the traffic log need this; a page of sections does not.
   */
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
      <header className="flex flex-none items-start justify-between gap-4 border-b px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-none items-center gap-2">{actions}</div> : null}
      </header>
      {fill ? (
        <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Wide enough for a two-column section, narrow enough that a line of
              prose does not run the width of a 27-inch display. */}
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
  className?: string
  children: ReactNode
}

/** One block of a page: a heading, an optional sentence, and its content. */
export function PageSection({
  title,
  description,
  actions,
  className,
  children
}: PageSectionProps): React.JSX.Element {
  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-none tracking-tight">{title}</h3>
          {description ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-none items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn('px-4 pb-4 text-xs', className)}>{children}</div>
    </section>
  )
}

/**
 * A read-only fact with its label above it. The same shape the device
 * information has always used, now shared by every page that states one.
 */
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

/**
 * What a page shows when it has nothing to show. A page that is simply blank
 * reads as broken; one that says why it is blank reads as waiting.
 */
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
