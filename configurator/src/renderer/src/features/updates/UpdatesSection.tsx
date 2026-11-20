import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/app/workspace/workspace-store'
import { useAppInfo } from '@/features/device/app-info'
import { useDeviceStore } from '@/features/device/device-store'
import { boardName } from '@/features/configuration/board-labels'
import {
  SIMHUB_MINIMUM_VERSION,
  boardBehind,
  type AppUpdateStatus,
  type SimHubStatus
} from '@shared/app-updates'
import type { DeviceSession } from '@shared/device'
import { compareVersions } from '@shared/version-compare'
import { checkForUpdates, installSimHubPlugin, useUpdateStore } from './update-store'
import { t } from '@shared/ui-text'

const MINUTE_MS = 60_000
const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'always' })
const ACTION = 'h-7 flex-none px-2.5'

function Chip({ tone, children }: { tone: 'green' | 'grey' | 'amber'; children: React.ReactNode }): React.JSX.Element {
  return (
    <Badge
      variant="outline"
      className={cn(
        'flex-none',
        tone === 'green' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
        tone === 'grey' && 'text-muted-foreground',
        tone === 'amber' && 'border-amber-500/40 bg-amber-500/10 text-amber-300'
      )}
    >
      {children}
    </Badge>
  )
}

function Row({
  name,
  version,
  children
}: {
  name: string
  version?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[210px_70px_minmax(0,1fr)] items-center gap-2 border-b py-[7px] text-[12.5px]">
      <span className="truncate">{name}</span>
      <span className={cn('tabular-nums', version ? undefined : 'text-muted-foreground/70')}>
        {version ?? '—'}
      </span>
      <span className="flex items-center justify-end gap-2">{children}</span>
    </div>
  )
}

function AppState({ app }: { app: AppUpdateStatus }): React.JSX.Element | null {
  const latest = app.latest ?? ''
  switch (app.state) {
    case 'current':
      return <Chip tone="grey">{t('updates.section.upToDate')}</Chip>
    case 'idle':
      return <Chip tone="grey">{t('updates.section.notChecked')}</Chip>
    case 'checking':
      return <Chip tone="grey">{t('updates.section.checking')}</Chip>
    case 'downloading':
      return <Chip tone="grey">{t('updates.section.downloading', { progress: app.progress ?? 0 })}</Chip>
    case 'failed':
      return <span title={app.error}><Chip tone="amber">{t('updates.section.checkFailed')}</Chip></span>
    case 'available':
      return (
        <>
          <Chip tone="green">{t('updates.section.available', { version: latest })}</Chip>
          <Button variant="outline" className={ACTION} onClick={() => void window.pitrig.openUpdatePage({ page: 'release' })}>
            {t('updates.banner.download')}</Button>
        </>
      )
    case 'ready':
      return (
        <>
          <Chip tone="green">{t('updates.section.ready', { version: latest })}</Chip>
          <Button variant="outline" className={ACTION} onClick={() => void window.pitrig.installAppUpdate()}>
            {t('updates.banner.restartAndUpdate')}</Button>
        </>
      )
  }
}

function firmwareBehind(session: DeviceSession, released: string): boolean {
  if (boardBehind(session, released)) return true
  return !session.firmware?.storageAvailable && compareVersions(session.info.firmwareVersion, released) === -1
}

function FirmwareRow({ released }: { released?: string }): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  if (!session) {
    return (
      <Row name={t('updates.section.boardFirmware')}>
        <span className="text-[11.5px] text-muted-foreground/70">{t('updates.section.connectABoard')}</span>
      </Row>
    )
  }
  return (
    <Row
      name={t('updates.section.boardNameFirmware', { board: boardName(session.info.boardId) })}
      version={session.info.firmwareVersion}
    >
      {released === undefined ? null : firmwareBehind(session, released) ? (
        <>
          <Chip tone="green">{t('updates.section.available', { version: released })}</Chip>
          <Button
            variant="outline"
            className={ACTION}
            onClick={() => useWorkspaceStore.getState().setTab('firmware')}
          >
            {t('updates.section.openFirmware')}</Button>
        </>
      ) : (
        <Chip tone="grey">{t('updates.section.upToDate')}</Chip>
      )}
    </Row>
  )
}

function SimHubRows({ simhub, checked }: { simhub: SimHubStatus; checked: boolean }): React.JSX.Element {
  return (
    <>
      <Row name={t('updates.section.simhub')} version={simhub.version}>
        {simhub.tooOld ? (
          <>
            <Chip tone="amber">{t('updates.section.olderThan', { minimum: SIMHUB_MINIMUM_VERSION })}</Chip>
            <Button variant="outline" className={ACTION} onClick={() => void window.pitrig.openUpdatePage({ page: 'simhub' })}>
              {t('updates.banner.getSimHub')}</Button>
          </>
        ) : checked ? (
          <Chip tone="grey">{t('updates.section.ok')}</Chip>
        ) : null}
      </Row>
      <Row name={t('updates.section.plugin')} version={simhub.plugin}>
        {simhub.pluginState === 'stale' || simhub.pluginState === 'missing' ? (
          <Button variant="outline" className={ACTION} onClick={() => void installSimHubPlugin()}>
            {simhub.pluginState === 'stale' ? t('updates.banner.updatePlugin') : t('updates.banner.addPlugin')}
          </Button>
        ) : simhub.pluginState === 'current' ? (
          <Chip tone="grey">{t('updates.section.upToDate')}</Chip>
        ) : null}
      </Row>
    </>
  )
}

function lastChecked(at: number): string {
  const minutes = Math.floor((Date.now() - at) / MINUTE_MS)
  if (minutes < 1) return t('updates.section.justNow')
  if (minutes < 60) return RELATIVE.format(-minutes, 'minute')
  if (minutes < 24 * 60) return RELATIVE.format(-Math.floor(minutes / 60), 'hour')
  return RELATIVE.format(-Math.floor(minutes / (24 * 60)), 'day')
}

export function UpdatesSection(): React.JSX.Element | null {
  const status = useUpdateStore((state) => state.status)
  const checking = useUpdateStore((state) => state.checking)
  const appInfo = useAppInfo()
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setTick((tick) => tick + 1), MINUTE_MS)
    return () => window.clearInterval(timer)
  }, [])

  const enabled = status?.enabled === true
  const appVersion = status?.app.current ?? appInfo?.version
  if (appVersion === undefined) return null

  return (
    <section className="rounded-xl border bg-card px-4 py-3 text-xs text-card-foreground shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">{t('updates.section.versions')}</h3>
        {enabled ? (
          <Button
            variant="outline"
            className={ACTION}
            disabled={checking || status.app.state === 'checking'}
            onClick={() => void checkForUpdates()}
          >
            {checking ? t('updates.section.checking') : t('updates.section.checkNow')}
          </Button>
        ) : null}
      </div>
      <div className="mt-2.5 border-t">
        <Row name={t('updates.section.pitrig')} version={appVersion}>
          {enabled ? <AppState app={status.app} /> : null}
        </Row>
        <FirmwareRow released={enabled ? status.releasedFirmware : undefined} />
        {status?.simhub ? <SimHubRows simhub={status.simhub} checked={enabled} /> : null}
      </div>
      {enabled && status.checkedAt !== undefined ? (
        <p className="mt-2 text-[11.5px] text-muted-foreground/70">
          {t('updates.section.lastChecked', { time: lastChecked(status.checkedAt) })}
        </p>
      ) : null}
    </section>
  )
}
