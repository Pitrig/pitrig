import type { SerialPort } from 'serialport'

import type { DeviceSession } from '@shared/device'
import { DeviceServiceError } from './device-errors'
import {
  parseDeviceInfo,
  parseFirmwareUpdateInfo,
  parseFontAssetInfo,
  parseImageAssetInfo
} from './protocol-parsers'
import { requestResponse, type TrafficCallback } from './serial-request'
import { readConfiguration } from './simcore-protocol'

const PROBE_TIMEOUT_MS = 1_000
// The probe is the first thing written to a freshly opened port, and it opens
// with a newline of its own. A scan walks the baud rates in turn, and a request
// written at the wrong rate still reaches the device — as bytes that decode
// into garbage carrying no line ending. The next request, correct rate and all,
// is appended to that remnant and read as one unknown line, so the attempt that
// should have succeeded is the one that is lost. The leading newline closes the
// ruined line, which the device discards unrecognised, and leaves the request on
// a line of its own. Only a board reached over a USB-serial bridge ever shows
// this: a native USB link has no wrong rate to be probed at.
const INFO_REQUEST = '\n@SC:INFO\n'
const IMAGE_INFO_REQUEST = '@SC:IMAGE:INFO\n'
const FONT_INFO_REQUEST = '@SC:FONT:INFO\n'
const FIRMWARE_INFO_REQUEST = '@SC:FW:INFO\n'

export async function probeSimCore(
  port: SerialPort,
  onTraffic: TrafficCallback
): Promise<DeviceSession> {
  const infoLine = await requestResponse(
    port,
    INFO_REQUEST,
    '@SC:OK:INFO:',
    PROBE_TIMEOUT_MS,
    onTraffic
  )
  const info = parseDeviceInfo(infoLine)
  const configuration = await readConfiguration(port, info.boardId, onTraffic, 'not_simcore')
  if (configuration.board !== info.boardId) {
    throw new DeviceServiceError(
      'not_simcore',
      'The device configuration board does not match the connected hardware.'
    )
  }
  const fontAssets = await probeCapability(
    port,
    FONT_INFO_REQUEST,
    '@SC:OK:FONT:INFO:',
    parseFontAssetInfo,
    onTraffic
  )
  const imageAssets = await probeCapability(
    port,
    IMAGE_INFO_REQUEST,
    '@SC:OK:IMAGE:INFO:',
    parseImageAssetInfo,
    onTraffic
  )
  const firmware = await probeCapability(
    port,
    FIRMWARE_INFO_REQUEST,
    '@SC:OK:FW:INFO:',
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

/**
 * A capability the connected firmware may not have. Firmware that does not know
 * the command answers `unknown_command` — bare from the configuration control,
 * or under its namespace as `<TAG>:unknown_command` — and that is a fact about
 * the board rather than a failure, so the probe reports the capability absent
 * and the panel for it stays away.
 *
 * The reason is read from the device's own token rather than from the message:
 * the message is a translated sentence for the reader, and matching its text
 * made every probe here reject a board it was meant to accept.
 */
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
