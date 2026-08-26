import type { SerialPort } from 'serialport'

import { MAXIMUM_CONFIGURATION_PAYLOAD_SIZE, type DeviceErrorCode } from '@shared/device'
import { describeDeviceError } from '@shared/device-error-message'
import { DeviceServiceError } from './device-errors'

export type TrafficCallback = (direction: 'rx' | 'tx', data: string) => void

export const CONFIGURATION_RESPONSE_PREFIX = '@SC:OK:CONFIG:'
export const MAXIMUM_RESPONSE_BUFFER_SIZE =
  CONFIGURATION_RESPONSE_PREFIX.length +
  'dashboard:'.length +
  MAXIMUM_CONFIGURATION_PAYLOAD_SIZE +
  '\r\n'.length
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
