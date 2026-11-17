import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'

import { BOARD_NAMES } from '@/features/configuration/board-labels'
import { CONFIGURATION_SCHEMA_VERSION, type DeviceSession } from '@shared/device'
import { firmwareChangesFor, type FirmwareChangeKind } from '@shared/firmware-changes'
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
  session
}: {
  session: DeviceSession
}): React.JSX.Element | null {
  const { boardId, firmwareVersion, schemaVersion } = session.info
  const releases = firmwareChangesFor(__PITRIG_FIRMWARE_CHANGES__, boardId, firmwareVersion)
  const schemaChanges = schemaVersion < CONFIGURATION_SCHEMA_VERSION
  const count = releases.reduce((total, release) => total + release.changes.length, 0)
  if (count === 0 && !schemaChanges) return null

  return (
    <div className="space-y-2 text-[11px]">
      {schemaChanges ? (
        <p className="text-amber-400">{t('updates.firmware.schemaNote')}</p>
      ) : null}
      {count > 0 ? (
        <details className="group rounded-md border bg-muted/20">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-2">
            <ChevronRight
              aria-hidden="true"
              className="size-3 transition-transform group-open:rotate-90"
            />
            <span className="font-medium">
              {t('updates.firmware.changesTitle', { board: BOARD_NAMES[boardId] })}
            </span>
            <span className="text-muted-foreground">
              {t('updates.firmware.changesCount', { count })}
            </span>
          </summary>
          <div className="space-y-1 border-t px-2 py-2">
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
                <ul className="space-y-1.5 pb-1 pl-5">
                  {release.changes.map((change, item) => (
                    <li key={item} className="flex gap-2">
                      <span className={`w-14 flex-none ${KIND_STYLE[change.kind]}`}>
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
        </details>
      ) : null}
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
