import type { ReactNode } from 'react'

const PREVIEW_CLASS =
  'aspect-3/2 w-1/2 flex-none overflow-hidden rounded border bg-black/40 p-1.5'

export function TemplateCard({
  preview,
  name,
  badges,
  description,
  meta,
  actions
}: {
  preview: ReactNode
  name: string
  badges?: ReactNode
  description?: string
  meta: string
  actions: ReactNode
}): React.JSX.Element {
  return (
    <li className="group flex items-center gap-3 rounded-md border p-2">
      <div className={PREVIEW_CLASS}>{preview}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium" title={name}>
              {name}
            </span>
            {badges ? (
              <div className="flex flex-wrap items-center gap-1">{badges}</div>
            ) : null}
          </div>
          <div className="flex flex-none flex-col gap-1">{actions}</div>
        </div>
        <span className="text-[11px] text-muted-foreground">{meta}</span>
        {description ? (
          <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </li>
  )
}
