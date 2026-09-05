import { Plug } from 'lucide-react'
import { t } from '@shared/ui-text'

import { EmptyState, PageSection, PageShell, ReadOnlyField } from '@/app/workspace/PageShell'
import { CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import type { ConfigurationDocumentState } from '@shared/device'
import { useAppInfo } from './app-info'
import { describeBootFailures, describeLastBoot } from './device-health'
import { useDeviceStore } from './device-store'

function describeDocumentState(state: ConfigurationDocumentState): string {
  const label = t(`device.documentState.${state.outcome}`)
  return state.outcome === 'valid'
    ? t('device.documentState.withGeneration', { label, generation: state.generation })
    : label
}

export function InfoPage(): React.JSX.Element {
  const session = useDeviceStore((state) => state.session)
  const status = useDeviceStore((state) => state.status)
  const connection = useDeviceStore((state) => state.connection)
  const error = useDeviceStore((state) => state.error)
  const appInfo = useAppInfo()

  return (
    <PageShell title={t('device.infoPage.info')} description={t('device.infoPage.theConnectedBoardTheLink')}>
      <PageSection
        title={t('device.infoPage.board')}
        description={
          session
            ? t('device.infoPage.reportedByTheFirmwareItself')
            : t('device.infoPage.connectAPitrigBoardTo')
        }
      >
        {session ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField label={t('device.infoPage.board')} value={session.info.boardId} />
            <ReadOnlyField
              label={t('device.infoPage.display')}
              value={
                session.info.display
                  ? t('device.infoPage.displaySize', {
                      width: session.info.display.width,
                      height: session.info.display.height
                    })
                  : t('device.infoPage.noDisplay')
              }
            />
            <ReadOnlyField label={t('device.infoPage.firmware')} value={session.info.firmwareVersion} />
            <ReadOnlyField label={t('device.infoPage.schemaVersion')} value={String(session.info.schemaVersion)} />
            {CONFIGURATION_DOCUMENT_IDS.map((id) => (
              <ReadOnlyField
                key={id}
                label={t('device.infoPage.idConfig', { id: t(`documents.label.${id}`) })}
                value={describeDocumentState(session.info.documents[id])}
              />
            ))}
            <ReadOnlyField
              label={t('device.infoPage.persistentStorage')}
              value={session.info.storageAvailable ? t('device.infoPage.available') : t('device.infoPage.unavailable')}
            />
            <ReadOnlyField
              label={t('device.infoPage.firmwareSlots')}
              value={
                session.firmware
                  ? t('device.infoPage.firmwareSlotsValue', {
                      running: session.firmware.running,
                      target: session.firmware.target
                    })
                  : t('device.infoPage.singlePartition')
              }
            />
            {session.info.health ? (
              <>
                <ReadOnlyField
                  label={t('device.infoPage.startup')}
                  value={
                    session.info.health.safeMode
                      ? t('device.infoPage.safeMode')
                      : t('device.infoPage.normalMode')
                  }
                />
                <ReadOnlyField label={t('device.infoPage.lastBoot')} value={describeLastBoot(session.info.health)} />
                <ReadOnlyField
                  label={t('device.infoPage.recentFailures')}
                  value={describeBootFailures(session.info.health)}
                />
              </>
            ) : null}
          </div>
        ) : (
          <EmptyState
            icon={<Plug aria-hidden="true" className="size-6" />}
            title={t('device.infoPage.noBoardConnected')}
          >
            {t('device.infoPage.pickAPortAtThe')}</EmptyState>
        )}
      </PageSection>

      <PageSection title={t('device.infoPage.connection')} description={t('device.infoPage.theSerialLinkThisWindow')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadOnlyField label={t('device.infoPage.status')} value={status} />
          <ReadOnlyField label={t('device.infoPage.port')} value={connection?.displayName ?? t('device.infoPage.notConnected')} />
          <ReadOnlyField label={t('device.infoPage.path')} value={connection?.path ?? '—'} />
          <ReadOnlyField
            label={t('device.infoPage.speed')}
            value={connection ? t('device.infoPage.baudRate', { baudRate: connection.baudRate }) : '—'}
          />
        </div>
        {error ? <p className="mt-3 text-[11px] text-red-400">{error.message}</p> : null}
      </PageSection>

      <PageSection title={t('device.infoPage.application')} description={t('device.infoPage.thisBuildOfTheConfigurator')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadOnlyField label={t('device.infoPage.name')} value={appInfo?.name ?? '—'} />
          <ReadOnlyField label={t('device.infoPage.version')} value={appInfo?.version ?? '—'} />
          <ReadOnlyField label={t('device.infoPage.platform')} value={appInfo?.platform ?? '—'} />
        </div>
      </PageSection>
    </PageShell>
  )
}
