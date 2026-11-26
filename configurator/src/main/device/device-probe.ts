import type { SerialPort } from 'serialport'

import {
  BOARD_PROFILES,
  type DeviceErrorCode,
  type DeviceInfo,
  type DeviceSession,
  type PitrigBoardId
} from '@shared/device'
import type { SessionDisplayPanel } from '@shared/display-panel'
import { DeviceServiceError } from './device-errors'
import { parseFirmwareUpdateInfo, parseFontAssetInfo, parseImageAssetInfo } from './asset-info-parsers'
import { parseDeviceInfo, parseDisplayPanel } from './protocol-parsers'
import { requestResponse, type TrafficCallback } from './serial-request'
import { readConfiguration } from './pitrig-protocol'
import { CONTROL_PREFIX } from '@shared/control-protocol'

const PROBE_TIMEOUT_MS = 1_000
const STARTUP_BUSY_MS = 12_000
const INFO_REQUEST = `\n${CONTROL_PREFIX}INFO\n`
const IMAGE_INFO_REQUEST = `${CONTROL_PREFIX}IMAGE:INFO\n`
const FONT_INFO_REQUEST = `${CONTROL_PREFIX}FONT:INFO\n`
const FIRMWARE_INFO_REQUEST = `${CONTROL_PREFIX}FW:INFO\n`
const PANEL_REQUEST = `${CONTROL_PREFIX}PANEL\n`
const LINK_ERRORS: readonly DeviceErrorCode[] = [
  'no_answer',
  'permission_denied',
  'port_busy',
  'port_missing',
  'serial_error'
]

export async function identifyPitrig(
  port: SerialPort,
  onTraffic: TrafficCallback
): Promise<DeviceInfo> {
  const infoLine = await requestResponse(
    port,
    INFO_REQUEST,
    `${CONTROL_PREFIX}OK:INFO:`,
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
  const stored = await readConfiguration(port, info.boardId, onTraffic, 'not_pitrig')
  const fontAssets = await probeCapability(
    port,
    FONT_INFO_REQUEST,
    `${CONTROL_PREFIX}OK:FONT:INFO:`,
    parseFontAssetInfo,
    onTraffic
  )
  const imageAssets = await probeCapability(
    port,
    IMAGE_INFO_REQUEST,
    `${CONTROL_PREFIX}OK:IMAGE:INFO:`,
    parseImageAssetInfo,
    onTraffic
  )
  const firmware = await probeCapability(
    port,
    FIRMWARE_INFO_REQUEST,
    `${CONTROL_PREFIX}OK:FW:INFO:`,
    parseFirmwareUpdateInfo,
    onTraffic
  )
  const displayPanel = await probeDisplayPanel(port, info.boardId, onTraffic)
  return {
    info,
    ...stored,
    ...(fontAssets ? { fontAssets } : {}),
    ...(imageAssets ? { imageAssets } : {}),
    ...(firmware ? { firmware } : {}),
    ...(displayPanel === undefined ? {} : { displayPanel })
  }
}

async function probeDisplayPanel(
  port: SerialPort,
  board: PitrigBoardId,
  onTraffic: TrafficCallback
): Promise<SessionDisplayPanel | undefined> {
  const panels = BOARD_PROFILES[board].displayPanels
  if (!panels) return undefined
  try {
    const line = await requestResponse(
      port,
      PANEL_REQUEST,
      `${CONTROL_PREFIX}OK:PANEL:`,
      PROBE_TIMEOUT_MS,
      onTraffic,
      'not_pitrig',
      STARTUP_BUSY_MS
    )
    return parseDisplayPanel(line, panels.length)
  } catch (error) {
    if (isUnknownCommand(error)) return 'unsupported'
    if (error instanceof DeviceServiceError && !LINK_ERRORS.includes(error.code)) return undefined
    throw error
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
      onTraffic,
      'not_pitrig',
      STARTUP_BUSY_MS
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
