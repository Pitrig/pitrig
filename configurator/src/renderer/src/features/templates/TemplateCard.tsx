import type { ReactNode } from 'react'

/**
 * One library entry, whichever kind it is.
 *
 * Dashboards and widgets answer different questions but they are the same sort
 * of thing to look at — a picture, a name, a line of facts, and what you can do
 * with it — so they get one card rather than two that drift apart. The picture
 * leads, because it is the only part that says what the entry actually is; the
 * counts underneath only qualify it.
 */

/**
 * Half the card, and stated as a fraction rather than as pixels: the grid is two
 * columns and the columns follow the window, so a fixed width would be half a
 * card at one size and a stamp at another. A 1024 × 600 race dashboard has small
 * text on it, and a stamp of it says nothing.
 *
 * Both kinds sit in the same inset frame: a widget is an object that would read
 * as cropped flush against the border, and a screen inset by the same amount
 * reads as a display in a bezel rather than as a mistake.
 */
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
  /** The line of facts under the name: sizes, counts. */
  meta: string
  actions: ReactNode
}): React.JSX.Element {
  return (
    <li className="group flex items-center gap-3 rounded-md border p-2">
      <div className={PREVIEW_CLASS}>{preview}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* The actions sit in this row rather than in a column of their own, so
            the two lines under them have the whole width to themselves. With a
            column beside it the name and the badges shared 144 pixels with the
            buttons, and the badges won — the name was truncated away to nothing
            while "Starter · 480 × 480" stayed. */}
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
        {/* Wrapped rather than cut: a description is the one thing on the card
            the author wrote themselves, and half of it is worse than none. The
            card grows for a long one, and the grid row grows with it, so the
            pair stays level. */}
        {description ? (
          <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </li>
  )
}
