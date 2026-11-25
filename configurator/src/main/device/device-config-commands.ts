import type {
  DeviceConfiguration,
  DeviceInfo,
  DeviceConfigurationApplyResult,
  DeviceConfigurationResetResult,
  DeviceConfigurationSaveResult,
  DeviceResult,
  DeviceSession,
  DeviceState
} from '../../shared/device'
import {
  CONFIGURATION_DOCUMENTS,
  CONFIGURATION_DOCUMENT_IDS,
  CONFIGURATION_SCHEMA_VERSION,
  type ConfigurationDocumentId
} from '../../shared/configuration-schema'
import { documentOf, mergeDocument } from '../../shared/configuration-documents'
import { DeviceServiceError, failure, success } from './device-errors'
import { prepareDeviceConfigurationJson } from './configuration-json'
import { parseDeviceInfo } from './protocol-parsers'
import { requestResponse } from './serial-request'
import type { ConnectionManager, OpenedDevice } from './device-connection'
import type { LinkOwner } from './link-owner'
import { sentTraffic } from './serial-traffic-reporter'
import type { TrafficCallback } from './serial-request'
import {
  applyConfiguration,
  readConfiguration,
  resetConfiguration,
  resetConfigurationDocument,
  saveConfiguration,
  validateConfiguration
} from './pitrig-protocol'
import { t } from '@shared/ui-text'
import { CONTROL_PREFIX } from '@shared/control-protocol'

export async function readDeviceConfiguration(
  connection: ConnectionManager,
  owner: LinkOwner
): Promise<DeviceResult<DeviceState>> {
  return owner.command(async ({ port, session, traffic }) => {
    const configuration = await readConfiguration(
      port,
      session.info.boardId,
      sentTraffic(traffic)
    )
    if (connection.port !== port || connection.getState().session !== session) {
      throw new DeviceServiceError('serial_error', t('device.deviceConfigCommands.theConnectedDeviceChangedDuring'))
    }
    connection.setState({ ...connection.getState(), session: { ...session, configuration } })
    return success(connection.getState())
  })
}

export async function applyDeviceConfiguration(
  connection: ConnectionManager,
  owner: LinkOwner,
  json: string,
  documents?: ConfigurationDocumentId[]
): Promise<DeviceResult<DeviceConfigurationApplyResult>> {
  return owner.command(async ({ port, session, traffic }) => {
    const prepared = prepareConfiguration(json, session)
    if (!prepared.ok) return prepared
    const selected = (documents ?? [...CONFIGURATION_DOCUMENT_IDS]).filter(
      (document) => !CONFIGURATION_DOCUMENTS[document].rebootRequired
    )
    for (const document of selected) {
      await applyConfiguration(
        port,
        document,
        prepared.value.payloads[document],
        sentTraffic(traffic)
      )
    }
    return success({ configuration: prepared.value.configuration, documents: selected })
  })
}

export async function validateDeviceConfiguration(
  owner: LinkOwner,
  json: string,
  documents: ConfigurationDocumentId[]
): Promise<DeviceResult<ConfigurationDocumentId[]>> {
  return owner.command(async ({ port, session, traffic }) => {
    const prepared = prepareConfiguration(json, session)
    if (!prepared.ok) return prepared
    const onTraffic = sentTraffic(traffic)
    for (const document of documents) {
      await validateConfiguration(port, document, prepared.value.payloads[document], onTraffic)
    }
    return success(documents)
  })
}

export async function saveDeviceConfiguration(
  connection: ConnectionManager,
  owner: LinkOwner,
  json: string,
  documents?: ConfigurationDocumentId[]
): Promise<DeviceResult<DeviceConfigurationSaveResult>> {
  return owner.command(async ({ port, session, traffic }) => {
    const prepared = prepareConfiguration(json, session)
    if (!prepared.ok) return prepared
    const requested = documents ?? [...CONFIGURATION_DOCUMENT_IDS]
    const selected = CONFIGURATION_DOCUMENT_IDS.filter((document) =>
      requested.includes(document)
    ).reverse()
    const onTraffic = sentTraffic(traffic)
    const written: ConfigurationDocumentId[] = []
    try {
      for (const document of selected) {
        await writeDocument(port, session, document, prepared.value.payloads[document], onTraffic)
        written.push(document)
      }
    } finally {
      let held = session.configuration
      for (const document of written) {
        held = mergeDocument(held, document, documentOf(prepared.value.configuration, document))
      }
      await commitSession(
        connection,
        port,
        session,
        held,
        onTraffic,
        written.length < selected.length && owesRestart(written)
      )
    }
    return success({
      configuration: prepared.value.configuration,
      documents: selected,
      rebootRequired: owesRestart(selected)
    })
  })
}

export async function resetDeviceConfiguration(
  connection: ConnectionManager,
  owner: LinkOwner,
  document?: ConfigurationDocumentId
): Promise<DeviceResult<DeviceConfigurationResetResult>> {
  return owner.command(async ({ port, session, traffic }) => {
    const onTraffic = sentTraffic(traffic)
    const erased = document ? [document] : [...CONFIGURATION_DOCUMENT_IDS]
    if (document) await resetConfigurationDocument(port, document, onTraffic)
    else await resetConfiguration(port, onTraffic)
    let configuration: DeviceConfiguration = session.configuration
    for (const id of erased) {
      configuration = mergeDocument(configuration, id, { board: session.info.boardId })
    }
    await commitSession(connection, port, session, configuration, onTraffic, true)
    return success({ configuration, documents: erased, rebootRequired: true })
  })
}

async function writeDocument(
  port: OpenedDevice['port'],
  session: DeviceSession,
  document: ConfigurationDocumentId,
  payload: string,
  onTraffic: TrafficCallback
): Promise<void> {
  try {
    await saveConfiguration(port, document, payload, onTraffic)
  } catch (error) {
    if (!(error instanceof DeviceServiceError) || error.code !== 'no_answer') throw error
    const info = await readInfo(port, session, onTraffic)
    const before = session.info.documents[document]
    const after = info.documents[document]
    if (after.generation === before.generation || after.outcome !== 'valid') throw error
  }
}

async function commitSession(
  connection: ConnectionManager,
  port: OpenedDevice['port'],
  session: DeviceSession,
  configuration: DeviceConfiguration,
  onTraffic: TrafficCallback,
  restartOwed: boolean
): Promise<void> {
  if (connection.port !== port || connection.getState().session !== session) return
  const info = await readInfo(port, session, onTraffic)
  if (connection.port !== port || connection.getState().session !== session) return
  connection.setState({
    ...connection.getState(),
    session: {
      ...session,
      configuration,
      info,
      ...(restartOwed ? { restartOwed: true } : {})
    }
  })
}

function owesRestart(documents: readonly ConfigurationDocumentId[]): boolean {
  return documents.some((document) => CONFIGURATION_DOCUMENTS[document].rebootRequired)
}

async function readInfo(
  port: OpenedDevice['port'],
  session: DeviceSession,
  onTraffic: TrafficCallback
): Promise<DeviceInfo> {
  try {
    const line = await requestResponse(
      port,
      `${CONTROL_PREFIX}INFO\n`,
      `${CONTROL_PREFIX}OK:INFO:`,
      1_000,
      onTraffic,
      'board_refused'
    )
    return parseDeviceInfo(line)
  } catch {
    return session.info
  }
}

function prepareConfiguration(
  json: string,
  session: DeviceSession
): DeviceResult<{
  configuration: DeviceConfiguration
  payloads: Record<ConfigurationDocumentId, string>
}> {
  if (session.info.schemaVersion !== CONFIGURATION_SCHEMA_VERSION) {
    return failure({
      code: 'invalid_request',
      message: t('device.draftState.theBoardFirmwareReadsSchema', {
        schema: session.info.schemaVersion,
        expected: CONFIGURATION_SCHEMA_VERSION
      })
    })
  }
  try {
    return success(prepareDeviceConfigurationJson(json, session.info.boardId))
  } catch (error) {
    return failure({
      code: 'invalid_request',
      message: error instanceof Error ? error.message : 'Invalid device configuration.'
    })
  }
}
