import { InfoHint } from './InfoHint'

/**
 * One property: its name on the left, its control on the right.
 *
 * The name used to sit above the control, which cost two rows for every
 * property and made a widget with thirty of them a panel nobody reaches the
 * bottom of. Side by side halves that, and the fixed name column is what makes
 * a column of controls line up instead of stepping in and out with the length
 * of each label.
 */

export interface PropertyMeta {
  /** The explanation behind the ⓘ, from `hints.ts`. */
  hint?: string
  /**
   * Whether the document actually carries this property. The document is
   * sparse, so a field showing a default is showing something that is not
   * written anywhere — the dot is the difference, and clicking it takes the
   * property back out.
   */
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
  /**
   * Puts the control on its own line under the name. For the few controls that
   * cannot live in half a narrow panel — a telemetry search, a font button with
   * a size beside it — the fixed name column would leave them unusable.
   */
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
