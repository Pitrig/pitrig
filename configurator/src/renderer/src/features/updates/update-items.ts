import { SIMHUB_MINIMUM_VERSION, boardBehind, type UpdateStatus } from '@shared/app-updates'
import { CONFIGURATION_SCHEMA_VERSION } from '@shared/configuration-schema'
import type { DeviceSession } from '@shared/device'
import { useWorkspaceStore } from '@/app/workspace/workspace-store'
import { installSimHubPlugin } from './update-store'
import { t } from '@shared/ui-text'

export interface UpdateItem {
  key: string
  message: string
  label: string
  act: () => void
}

export function updateItems(status: UpdateStatus, session: DeviceSession | undefined): UpdateItem[] {
  if (!status.enabled) return []
  return [appItem(status), firmwareItem(status, session), ...simHubItems(status)].filter(
    (item): item is UpdateItem => item !== undefined
  )
}

function appItem({ app }: UpdateStatus): UpdateItem | undefined {
  if (app.latest === undefined) return undefined
  if (app.state === 'ready') {
    return {
      key: `app-${app.latest}`,
      message: t('updates.banner.appReady', { version: app.latest }),
      label: t('updates.banner.restartAndUpdate'),
      act: () => void window.pitrig.installAppUpdate()
    }
  }
  if (app.state !== 'available') return undefined
  return {
    key: `app-${app.latest}`,
    message: t('updates.banner.appAvailable', { version: app.latest }),
    label: t('updates.banner.download'),
    act: () => void window.pitrig.openUpdatePage({ page: 'release' })
  }
}

function firmwareItem(status: UpdateStatus, session: DeviceSession | undefined): UpdateItem | undefined {
  if (session?.info.schemaVersion !== CONFIGURATION_SCHEMA_VERSION) return undefined
  if (!boardBehind(session, status.releasedFirmware)) return undefined
  return {
    key: `firmware-${status.releasedFirmware}`,
    message: t('updates.banner.firmwareAvailable', {
      version: status.releasedFirmware,
      running: session.info.firmwareVersion
    }),
    label: t('updates.banner.openFirmware'),
    act: () => useWorkspaceStore.getState().setTab('firmware')
  }
}

function simHubItems({ simhub }: UpdateStatus): UpdateItem[] {
  if (!simhub) return []
  const items: UpdateItem[] = []
  if (simhub.pluginState === 'stale' || simhub.pluginState === 'missing') {
    items.push({
      key: `plugin-${simhub.bundledPlugin ?? ''}`,
      message:
        simhub.pluginState === 'stale'
          ? t('updates.banner.pluginStale', {
              installed: simhub.plugin ?? '',
              bundled: simhub.bundledPlugin ?? ''
            })
          : t('updates.banner.pluginMissing'),
      label:
        simhub.pluginState === 'stale'
          ? t('updates.banner.updatePlugin')
          : t('updates.banner.addPlugin'),
      act: () => void installSimHubPlugin()
    })
  }
  if (simhub.tooOld) {
    items.push({
      key: `simhub-${simhub.version ?? ''}`,
      message: t('updates.banner.simhubOld', {
        version: simhub.version ?? '',
        minimum: SIMHUB_MINIMUM_VERSION
      }),
      label: t('updates.banner.getSimHub'),
      act: () => void window.pitrig.openUpdatePage({ page: 'simhub' })
    })
  }
  return items
}
