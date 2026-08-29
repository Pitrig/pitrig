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
  type ConfigurationDocumentId
} from '../../shared/configuration-schema'
import { documentOf, mergeDocument } from '../../shared/configuration-documents'
import { DeviceServiceError, failure, success } from './device-errors'
import { prepareDeviceConfigurationJson } from './configuration-json'
import { parseDeviceInfo } from './protocol-parsers'
import { requestResponse } from './serial-request'
import type { ConnectionManager, OpenedDevice } from './device-connection'
import type { OperationRunner } from './device-operation'
import {
  applyConfiguration,
  readConfiguration,
  resetConfiguration,
  resetConfigurationDocument,
  saveConfiguration
} from './simcore-protocol'

export async function readDeviceConfiguration(
  connection: ConnectionManager,
  runner: OperationRunner
): Promise<DeviceResult<DeviceState>> {
  return runner.run(async ({ port, session, traffic }) => {
    const configuration = await readConfiguration(
      port,
      session.info.boardId,
      runner.operationTraffic(traffic)
    )
    if (connection.port !== port || connection.getState().session !== session) {
      throw new DeviceServiceError('serial_error', 'The connected device changed during read.')
    }
    connection.setState({ ...connection.getState(), session: { ...session, configuration } })
    return success(connection.getState())
  })
}

export async function applyDeviceConfiguration(
  connection: ConnectionManager,
  runner: OperationRunner,
  json: string,
  documents?: ConfigurationDocumentId[]
): Promise<DeviceResult<DeviceConfigurationApplyResult>> {
  return runner.run(async ({ port, session, traffic }) => {
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
        runner.operationTraffic(traffic)
      )
    }
    return success({ configuration: prepared.value.configuration, documents: selected })
  })
}

export async function saveDeviceConfiguration(
  connection: ConnectionManager,
  runner: OperationRunner,
  json: string,
  documents?: ConfigurationDocumentId[]
): Promise<DeviceResult<DeviceConfigurationSaveResult>> {
  return runner.run(async ({ port, session, traffic }) => {
    const prepared = prepareConfiguration(json, session)
    if (!prepared.ok) return prepared
    const requested = documents ?? [...CONFIGURATION_DOCUMENT_IDS]
    const selected = CONFIGURATION_DOCUMENT_IDS.filter((document) =>
      requested.includes(document)
    ).reverse()
    for (const document of selected) {
      await saveConfiguration(
        port,
        document,
        prepared.value.payloads[document],
        runner.operationTraffic(traffic)
      )
    }
    if (connection.port === port && connection.getState().session === session) {
      let held = session.configuration
      for (const document of selected) {
        held = mergeDocument(held, document, documentOf(prepared.value.configuration, document))
      }
      const info = await readInfo(port, session, runner.operationTraffic(traffic))
      connection.setState({
        ...connection.getState(),
        session: { ...session, configuration: held, info }
      })
    }
    return success({
      configuration: prepared.value.configuration,
      documents: selected,
      rebootRequired: selected.some(
        (document) => CONFIGURATION_DOCUMENTS[document].rebootRequired
      )
    })
  })
}

export async function resetDeviceConfiguration(
  connection: ConnectionManager,
  runner: OperationRunner,
  document?: ConfigurationDocumentId
): Promise<DeviceResult<DeviceConfigurationResetResult>> {
  return runner.run(async ({ port, session, traffic }) => {
    const traffic_ = runner.operationTraffic(traffic)
    const erased = document ? [document] : [...CONFIGURATION_DOCUMENT_IDS]
    if (document) await resetConfigurationDocument(port, document, traffic_)
    else await resetConfiguration(port, traffic_)
    let configuration: DeviceConfiguration = session.configuration
    for (const id of erased) {
      configuration = mergeDocument(configuration, id, { board: session.info.boardId })
    }
    return success({ configuration, documents: erased, rebootRequired: true })
  })
}

async function readInfo(
  port: OpenedDevice['port'],
  session: DeviceSession,
  onTraffic: (direction: 'rx' | 'tx', data: string) => void
): Promise<DeviceInfo> {
  try {
    const line = await requestResponse(
      port,
      '\n@SC:INFO\n',
      '@SC:OK:INFO:',
      1_000,
      onTraffic,
      'serial_error'
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
  try {
    return success(prepareDeviceConfigurationJson(json, session.info.boardId))
  } catch (error) {
    return failure({
      code: 'configuration_rejected',
      message: error instanceof Error ? error.message : 'Invalid device configuration.'
    })
  }
}
