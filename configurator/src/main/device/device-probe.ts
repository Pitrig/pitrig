import type { SerialPort } from 'serialport'

import type { DeviceInfo, DeviceSession } from '@shared/device'
import { DeviceServiceError } from './device-errors'
import {
  parseDeviceInfo,
  parseFirmwareUpdateInfo,
  parseFontAssetInfo,
  parseImageAssetInfo
} from './protocol-parsers'
import { requestResponse, type TrafficCallback } from './serial-request'
import { readConfiguration } from './pitrig-protocol'

const PROBE_TIMEOUT_MS = 1_000
const INFO_REQUEST = '\n@PR:INFO\n'
const IMAGE_INFO_REQUEST = '@PR:IMAGE:INFO\n'
const FONT_INFO_REQUEST = '@PR:FONT:INFO\n'
const FIRMWARE_INFO_REQUEST = '@PR:FW:INFO\n'

export async function identifyPitrig(
  port: SerialPort,
  onTraffic: TrafficCallback
): Promise<DeviceInfo> {
  const infoLine = await requestResponse(
    port,
    INFO_REQUEST,
    '@PR:OK:INFO:',
    PROBE_TIMEOUT_MS,
    onTraffic
  )
  return parseDeviceInfo(infoLine)
}

export async function probePitrig(
  port: SerialPort,
  onTraffic: TrafficCallback
): Promise<DeviceSession> {
  const info = await identifyPitrig(port, onTraffic)
  const configuration = await readConfiguration(port, info.boardId, onTraffic, 'not_pitrig')
  const fontAssets = await probeCapability(
    port,
    FONT_INFO_REQUEST,
    '@PR:OK:FONT:INFO:',
    parseFontAssetInfo,
    onTraffic
  )
  const imageAssets = await probeCapability(
    port,
    IMAGE_INFO_REQUEST,
    '@PR:OK:IMAGE:INFO:',
    parseImageAssetInfo,
    onTraffic
  )
  const firmware = await probeCapability(
    port,
    FIRMWARE_INFO_REQUEST,
    '@PR:OK:FW:INFO:',
    parseFirmwareUpdateInfo,
    onTraffic
  )
  return {
    info,
    configuration,
    ...(fontAssets ? { fontAssets } : {}),
    ...(imageAssets ? { imageAssets } : {}),
    ...(firmware ? { firmware } : {})
  }
}

async function probeCapability<T>(
  port: SerialPort,
  request: string,
  responsePrefix: string,
  parse: (line: string) => T,
  onTraffic: TrafficCallback
): Promise<T | undefined> {
  try {
    const line = await requestResponse(
      port,
      request,
      responsePrefix,
      PROBE_TIMEOUT_MS,
      onTraffic
    )
    return parse(line)
  } catch (error) {
    if (isUnknownCommand(error)) {
      return undefined
    }
    throw error
  }
}

function isUnknownCommand(error: unknown): boolean {
  if (!(error instanceof DeviceServiceError) || error.token === undefined) {
    return false
  }
  return error.token.slice(error.token.lastIndexOf(':') + 1) === 'unknown_command'
}
