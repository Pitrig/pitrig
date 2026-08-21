import type { SerialPort } from 'serialport'

import { MAXIMUM_CONFIGURATION_PAYLOAD_SIZE, type DeviceErrorCode } from '@shared/device'
import { describeDeviceError } from '@shared/device-error-message'
import { DeviceServiceError } from './device-errors'

export type TrafficCallback = (direction: 'rx' | 'tx', data: string) => void

export const CONFIGURATION_RESPONSE_PREFIX = '@SC:OK:CONFIG:'
// The buffer holds the one line still being received, so it has to keep the
// longest line the device sends: a GET reply, which is the prefix, a payload up
// to the contract's bound, and the line ending. A smaller bound cut the head
// off a long configuration before its newline arrived, and by the time the
// line was complete the prefix it was waiting for was gone — every dashboard
// over the old 8 KiB failed the probe as "not a SimCore device".
export const MAXIMUM_RESPONSE_BUFFER_SIZE =
  CONFIGURATION_RESPONSE_PREFIX.length +
  'dashboard:'.length +
  MAXIMUM_CONFIGURATION_PAYLOAD_SIZE +
  '\r\n'.length
// Long enough for a board that is busy redrawing, short enough that a console
// that gets nothing back says so while the author is still looking at it.
const CONTROL_COMMAND_TIMEOUT_MS = 3_000

export function requestResponse(
  port: SerialPort,
  request: string,
  responsePrefix: string,
  timeoutMs: number,
  onTraffic: TrafficCallback,
  rejectionCode: DeviceErrorCode = 'not_simcore'
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    let settled = false

    const cleanup = (): void => {
      clearTimeout(timeoutTimer)
      port.off('data', onData)
      port.off('error', onError)
      port.off('close', onClose)
      buffer = ''
    }
    const finish = (error?: Error, response?: string): void => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(response ?? '')
    }
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      onTraffic('rx', text)
      buffer = (buffer + text).slice(-MAXIMUM_RESPONSE_BUFFER_SIZE)
      const lines = buffer.replaceAll('\r', '').split('\n')
      buffer = lines.pop() ?? ''
      const response = lines.find((line) => line.startsWith(responsePrefix))
      if (response) {
        finish(undefined, response)
        return
      }
      const deviceError = lines.find((line) => line.startsWith('@SC:ERR:'))
      if (deviceError) {
        const token = deviceError.slice('@SC:ERR:'.length).trim()
        finish(new DeviceServiceError(rejectionCode, describeDeviceError(token), token))
      }
    }
    const onError = (error: Error): void => finish(error)
    const onClose = (): void => {
      finish(new DeviceServiceError('serial_error', 'Serial port closed during request.'))
    }
    const sendRequest = (): void => {
      if (!port.isOpen || settled) return
      port.write(request, (error) => {
        if (error) finish(error)
        else onTraffic('tx', request)
      })
    }

    port.on('data', onData)
    port.once('error', onError)
    port.once('close', onClose)
    const timeoutTimer = setTimeout(() => {
      finish(new DeviceServiceError(rejectionCode, `The device did not answer ${request.trim()}.`))
    }, timeoutMs)
    port.flush(() => sendRequest())
  })
}

/**
 * One hand-typed line, and every `@SC:` line the board answers with.
 *
 * This is the debug console's request, and it differs from `requestResponse` in
 * the two ways a console needs: it waits for *a* terminating line rather than
 * one particular prefix, since the caller typed the command and nothing here
 * knows what its reply looks like; and `@SC:ERR:` is an answer to be shown
 * rather than a rejection to be thrown. Telemetry the board is streaming past
 * the command is dropped — only `@SC:` lines are the reply.
 *
 * A silent board resolves with what did arrive rather than failing, because
 * "the board said nothing" is itself the finding the console exists to show.
 */
export function sendControlCommand(
  port: SerialPort,
  command: string,
  onTraffic: TrafficCallback
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = `${command}\n`
    const collected: string[] = []
    let buffer = ''
    let settled = false

    const cleanup = (): void => {
      clearTimeout(timeoutTimer)
      port.off('data', onData)
      port.off('error', onError)
      port.off('close', onClose)
      buffer = ''
    }
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(collected)
    }
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      onTraffic('rx', text)
      buffer = (buffer + text).slice(-MAXIMUM_RESPONSE_BUFFER_SIZE)
      const lines = buffer.replaceAll('\r', '').split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('@SC:')) continue
        collected.push(line)
        if (line.startsWith('@SC:OK:') || line.startsWith('@SC:ERR:')) {
          finish()
          return
        }
      }
    }
    const onError = (error: Error): void => finish(error)
    const onClose = (): void => {
      finish(new DeviceServiceError('serial_error', 'Serial port closed during the command.'))
    }

    port.on('data', onData)
    port.once('error', onError)
    port.once('close', onClose)
    const timeoutTimer = setTimeout(() => finish(), CONTROL_COMMAND_TIMEOUT_MS)
    if (!port.isOpen) {
      finish(new DeviceServiceError('serial_error', 'The serial port is closed.'))
      return
    }
    port.write(request, (error) => {
      if (error) finish(error)
      else onTraffic('tx', request)
    })
  })
}
