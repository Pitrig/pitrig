import type { SimHubStatus } from '@shared/app-updates'
import { CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import type { ConfigurationDocumentState, DeviceConnection, DeviceSession } from '@shared/device'
import { t } from '@shared/ui-text'
import { describeBootFailures, describeLastBoot } from './device-health'

export interface SupportRow {
  label: string
  value: string
}

function documentLine(document: string, state: ConfigurationDocumentState): string {
  if (state.outcome === 'valid') {
    return t('device.supportDetails.documentStored', { document, generation: state.generation })
  }
  return t('device.supportDetails.documentState', {
    document,
    state: t(`device.supportDetails.state.${state.outcome}`)
  })
}

export function supportRows(
  session: DeviceSession | undefined,
  connection: DeviceConnection | undefined,
  platform: string | undefined
): SupportRow[] {
  const rows: SupportRow[] = []
  if (session) {
    const { info } = session
    rows.push({
      label: t('device.supportDetails.board'),
      value: t('device.supportDetails.boardValue', {
        board: info.boardId,
        display: info.display
          ? t('device.infoPage.displaySize', { width: info.display.width, height: info.display.height })
          : t('device.supportDetails.noDisplay')
      })
    })
    rows.push({
      label: t('device.supportDetails.setupOnBoard'),
      value: CONFIGURATION_DOCUMENT_IDS.map((id) =>
        documentLine(t(`documents.labelLower.${id}`), info.documents[id])
      ).join(' · ')
    })
    rows.push({
      label: t('device.supportDetails.schema'),
      value: t('device.supportDetails.schemaValue', {
        schema: info.schemaVersion,
        storage: info.storageAvailable
          ? t('device.supportDetails.storageAvailable')
          : t('device.supportDetails.noStorage')
      })
    })
    rows.push({
      label: t('device.infoPage.firmwareSlots'),
      value: session.firmware
        ? t('device.infoPage.firmwareSlotsValue', {
            running: session.firmware.running,
            target: session.firmware.target
          })
        : t('device.infoPage.singlePartition')
    })
  }
  rows.push({
    label: t('device.supportDetails.link'),
    value: connection
      ? t('device.supportDetails.linkValue', { path: connection.path, baudRate: connection.baudRate })
      : t('device.supportDetails.notConnected')
  })
  rows.push({ label: t('device.supportDetails.system'), value: platform ?? '—' })
  return rows
}

export function supportText({
  appVersion,
  session,
  simhub,
  rows
}: {
  appVersion: string | undefined
  session: DeviceSession | undefined
  simhub: SimHubStatus | undefined
  rows: readonly SupportRow[]
}): string {
  const lines: SupportRow[] = [{ label: t('updates.section.pitrig'), value: appVersion ?? '—' }]
  if (session) {
    lines.push({ label: t('updates.section.boardFirmware'), value: session.info.firmwareVersion })
    if (session.info.health) {
      lines.push({ label: t('device.infoPage.lastBoot'), value: describeLastBoot(session.info.health) })
      lines.push({
        label: t('device.infoPage.recentFailures'),
        value: describeBootFailures(session.info.health)
      })
    }
  }
  if (simhub) {
    lines.push({ label: t('updates.section.simhub'), value: simhub.version ?? '—' })
    lines.push({ label: t('updates.section.plugin'), value: simhub.plugin ?? '—' })
  }
  return [...lines, ...rows].map((row) => `${row.label}: ${row.value}`).join('\n')
}
