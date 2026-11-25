import { ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { boardBehind } from '@shared/app-updates'
import { CONFIGURATION_SCHEMA_VERSION, type DeviceSession } from '@shared/device'
import { firmwareChangesFor } from '@shared/firmware-changes'
import { t } from '@shared/ui-text'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { boardName } from '@/features/configuration/board-labels'
import { useBoardActivityReason } from '@/features/device/board-activity'
import { useDeviceStore } from '@/features/device/device-store'
import { FirmwareChangeList } from '@/features/updates/FirmwareChangeList'
import { updateBoardFromRelease, useUpdateStore } from '@/features/updates/update-store'
import { BoardUpdateSteps } from './BoardUpdateSteps'
import { updateBoard, useBoardUpdateStore } from './board-update-store'
import { openFirstInstall } from './first-install/first-install-store'

const CARD = 'rounded-xl border bg-card px-4 py-3.5 text-xs text-card-foreground shadow-sm'

const OUTCOME_STYLE = {
  success: 'text-muted-foreground',
  warning: 'text-amber-400',
  error: 'text-red-400'
} as const

function VersionChip({ behind, released }: { behind: boolean; released?: string }): React.JSX.Element | null {
  if (released === undefined) return null
  return behind ? (
    <Badge className="flex-none border-emerald-500/40 bg-emerald-500/10 text-emerald-300" variant="outline">
      {t('firmware.firmwareStatus.versionAvailable', { version: released })}
    </Badge>
  ) : (
    <Badge className="flex-none text-muted-foreground" variant="outline">
      {t('firmware.firmwareStatus.upToDate')}
    </Badge>
  )
}

function SelfUpdateNotice({ session }: { session: DeviceSession }): React.JSX.Element {
  const portId = useDeviceStore((state) => state.connection?.portId)
  return (
    <section className="space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200 shadow-sm">
      <p>{t('firmware.firmwareStatus.cannotUpdateItself')}</p>
      <Button
        className="text-foreground"
        variant="outline"
        onClick={() => openFirstInstall({ board: session.info.boardId, portId })}
      >
        {t('firmware.firstInstall.open')}
      </Button>
    </section>
  )
}

export function UpdateOutcome({ className }: { className?: string }): React.JSX.Element | null {
  const running = useBoardUpdateStore((state) => state.running)
  const outcome = useBoardUpdateStore((state) => state.outcome)
  if (!outcome || running) return null
  return <p className={cn('break-words', OUTCOME_STYLE[outcome.kind], className)}>{outcome.message}</p>
}

export function UpdateProgressCard(): React.JSX.Element {
  const progress = useBoardUpdateStore((state) => state.progress)
  return (
    <section className={CARD}>
      <BoardUpdateSteps
        progress={progress}
        action={
          progress?.step === 'install' ? (
            <Button className="flex-none" variant="outline" onClick={() => void window.pitrig.cancelFirmwareUpload()}>
              {t('common.cancel')}
            </Button>
          ) : undefined
        }
      />
    </section>
  )
}

export function FirmwareStatus({ session }: { session: DeviceSession }): React.JSX.Element {
  const status = useUpdateStore((state) => state.status)
  const preparing = useUpdateStore((state) => state.preparing)
  const running = useBoardUpdateStore((state) => state.running)
  const busyReason = useBoardActivityReason()
  const [changesOpen, setChangesOpen] = useState(false)
  const { boardId, firmwareVersion, schemaVersion } = session.info
  const firmware = session.firmware
  if (firmware?.storageAvailable !== true) return <SelfUpdateNotice session={session} />
  if (running) return <UpdateProgressCard />

  const released = status?.enabled ? status.releasedFirmware : undefined
  const behind = released !== undefined && boardBehind(session, released)
  const pending = firmware.rebootRequired
  const downloading = status?.firmwareDownload
  const releases = behind ? firmwareChangesFor(__PITRIG_FIRMWARE_CHANGES__, boardId, firmwareVersion) : []
  const count = releases.reduce((total, release) => total + release.changes.length, 0)

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">
            {t('firmware.firmwareStatus.boardRuns', { board: boardName(boardId) })}
          </p>
          <p className="text-xl font-semibold tracking-tight">
            {t('firmware.firmwareStatus.firmwareVersion', { version: firmwareVersion })}
          </p>
        </div>
        <VersionChip behind={behind} released={released} />
      </div>

      {pending ? (
        <div className="mt-3 space-y-2">
          <p className="text-amber-400">{t('firmware.firmwareStatus.restartWaiting')}</p>
          <Button
            disabled={busyReason !== undefined}
            title={busyReason}
            onClick={() => void updateBoard()}
          >
            {t('firmware.firmwareStatus.restartToFinish')}
          </Button>
        </div>
      ) : behind ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            disabled={preparing || busyReason !== undefined}
            title={busyReason}
            onClick={() => void updateBoardFromRelease()}
          >
            {t('firmware.firmwareStatus.updateTo', { version: released })}
          </Button>
          {count > 0 ? (
            <button
              type="button"
              aria-expanded={changesOpen}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => setChangesOpen(!changesOpen)}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn('size-3 transition-transform', changesOpen ? 'rotate-90' : undefined)}
              />
              {t('firmware.firmwareStatus.whatChanges', { count })}
            </button>
          ) : null}
          {downloading !== undefined ? (
            <span className="text-muted-foreground">
              {t('updates.firmware.downloading', { progress: downloading })}
            </span>
          ) : null}
        </div>
      ) : null}

      {behind && changesOpen && count > 0 ? (
        <div className="mt-2">
          <FirmwareChangeList releases={releases} />
        </div>
      ) : null}
      {behind && schemaVersion < CONFIGURATION_SCHEMA_VERSION ? (
        <p className="mt-2 text-amber-400">{t('updates.firmware.schemaNote')}</p>
      ) : null}
      {firmware.pendingVerify ? (
        <p className="mt-2 text-amber-400">{t('firmware.firmwareStatus.notConfirmedYet')}</p>
      ) : null}
      <UpdateOutcome className="mt-2" />
      {behind || pending ? (
        <p className="mt-2.5 text-[11px] text-muted-foreground/75">{t('firmware.firmwareStatus.setupStays')}</p>
      ) : null}
    </section>
  )
}
