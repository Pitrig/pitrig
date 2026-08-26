import { InfoHint } from './InfoHint'

export interface PropertyMeta {
  hint?: string
  modified?: boolean
  onReset?: () => void
}

export function PropertyRow({
  label,
  controlId,
  hint,
  modified,
  onReset,
  block,
  children
}: PropertyMeta & {
  label: string
  controlId?: string
  block?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const name = (
    <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
      <label htmlFor={controlId} className="min-w-0 truncate" title={label}>
        {label}
      </label>
      {hint ? <InfoHint text={hint} label={label} /> : null}
      {modified && onReset ? <ResetDot label={label} onReset={onReset} /> : null}
    </span>
  )
  if (block) {
    return (
      <div className="space-y-1">
        {name}
        {children}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
      {name}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function ResetDot({ label, onReset }: { label: string; onReset: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      title={`${label} is set in this document — click to clear it`}
      aria-label={`Clear ${label}`}
      className="size-3 shrink-0 rounded-full p-[3px] hover:bg-muted"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onReset()
      }}
    >
      <span className="block size-full rounded-full bg-sky-400" />
    </button>
  )
}
