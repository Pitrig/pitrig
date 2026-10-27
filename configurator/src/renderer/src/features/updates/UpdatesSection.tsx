import { Button } from '@/components/ui/button'
import { PageSection, ReadOnlyField } from '@/app/workspace/PageShell'
import { useDeviceStore } from '@/features/device/device-store'
import {
  SIMHUB_MINIMUM_VERSION,
  boardBehind,
  type AppUpdateStatus,
  type SimHubStatus,
  type UpdateStatus
} from '@shared/app-updates'
import type { DeviceSession } from '@shared/device'
import { checkForUpdates, useUpdateStore } from './update-store'
import { t } from '@shared/ui-text'

export function UpdatesSection(): React.JSX.Element | null {
  const status = useUpdateStore((state) => state.status)
  const checking = useUpdateStore((state) => state.checking)
  const session = useDeviceStore((state) => state.session)
  if (!status) return null

  return (
    <PageSection
      title={t('updates.section.title')}
      description={status.enabled ? t('updates.section.description') : t('updates.section.disabled')}
      actions={
        status.enabled ? (
          <Button
            variant="outline"
            disabled={checking || status.app.state === 'checking'}
            onClick={() => void checkForUpdates()}
          >
            {checking ? t('updates.section.checking') : t('updates.section.checkNow')}
          </Button>
        ) : null
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadOnlyField label={t('updates.section.configurator')} value={describeApp(status.app)} />
        <ReadOnlyField label={t('updates.section.boardFirmware')} value={describeFirmware(status, session)} />
        {status.simhub ? (
          <>
            <ReadOnlyField label={t('updates.section.simhub')} value={describeSimHub(status.simhub)} />
            <ReadOnlyField label={t('updates.section.plugin')} value={describePlugin(status.simhub)} />
          </>
        ) : null}
      </div>
      {status.checkedAt !== undefined ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t('updates.section.lastChecked', { time: new Date(status.checkedAt).toLocaleString() })}
        </p>
      ) : null}
    </PageSection>
  )
}

function describeApp(app: AppUpdateStatus): string {
  const { current } = app
  const latest = app.latest ?? ''
  switch (app.state) {
    case 'idle':
      return t('updates.app.notChecked', { current })
    case 'checking':
      return t('updates.app.checking', { current })
    case 'current':
      return t('updates.app.current', { current })
    case 'available':
      return t('updates.app.available', { current, latest })
    case 'downloading':
      return t('updates.app.downloading', { current, latest, progress: app.progress ?? 0 })
    case 'ready':
      return t('updates.app.ready', { current, latest })
    case 'failed':
      return t('updates.app.failed', { current, error: app.error ?? '' })
  }
}

function describeFirmware(status: UpdateStatus, session: DeviceSession | undefined): string {
  const version = status.releasedFirmware
  if (!session) return t('updates.firmware.released', { version })
  const running = session.info.firmwareVersion
  return boardBehind(session, version)
    ? t('updates.firmware.behind', { running, version })
    : t('updates.firmware.current', { running })
}

function describeSimHub(simhub: SimHubStatus): string {
  const version = simhub.version ?? t('updates.simhub.unknownVersion')
  return simhub.tooOld
    ? t('updates.simhub.versionTooOld', { version, minimum: SIMHUB_MINIMUM_VERSION })
    : version
}

function describePlugin(simhub: SimHubStatus): string {
  switch (simhub.pluginState) {
    case 'missing':
      return t('updates.simhub.pluginMissing')
    case 'stale':
      return t('updates.simhub.pluginStale', {
        installed: simhub.plugin ?? '',
        bundled: simhub.bundledPlugin ?? ''
      })
    case 'current':
    case 'unknown':
      return simhub.plugin ?? t('updates.simhub.pluginMissing')
  }
}
