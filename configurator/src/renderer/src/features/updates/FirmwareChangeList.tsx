import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'

import type { FirmwareChangeKind, FirmwareChangeRelease } from '@shared/firmware-changes'
import { t } from '@shared/ui-text'

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*)/

const RELEASE_SUMMARY =
  'flex cursor-pointer list-none items-center gap-2 py-1 text-muted-foreground'

const KIND_STYLE: Record<FirmwareChangeKind, string> = {
  added: 'text-emerald-400',
  changed: 'text-sky-400',
  fixed: 'text-amber-400',
  removed: 'text-muted-foreground'
}

export function FirmwareChangeList({
  releases
}: {
  releases: readonly FirmwareChangeRelease[]
}): React.JSX.Element {
  return (
    <div className="space-y-1 rounded-md border bg-muted/20 px-2 py-2 text-[11px]">
      {releases.map((release, index) => (
        <details key={release.version} open={index === 0} className="group/release">
          <summary className={RELEASE_SUMMARY}>
            <ChevronRight
              aria-hidden="true"
              className="size-3 transition-transform group-open/release:rotate-90"
            />
            {release.firmware
              ? t('updates.firmware.changesRelease', { version: release.firmware })
              : t('updates.firmware.changesUnreleased')}
          </summary>
          <ul className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 pb-1 pl-5">
            {release.changes.map((change, item) => (
              <li key={item} className="col-span-2 grid grid-cols-subgrid">
                <span className={`whitespace-nowrap ${KIND_STYLE[change.kind]}`}>
                  {t(`updates.firmware.kind.${change.kind}`)}
                </span>
                <span className="min-w-0 text-foreground">
                  <InlineText text={change.text} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}

function InlineText({ text }: { text: string }): React.JSX.Element {
  return (
    <>
      {text.split(INLINE).map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={index} className="rounded bg-muted px-1">
              {part.slice(1, -1)}
            </code>
          )
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.slice(2, -2)}</strong>
        }
        return <Fragment key={index}>{part}</Fragment>
      })}
    </>
  )
}
