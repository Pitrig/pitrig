import { StringDecoder } from 'node:string_decoder'

import type { SerialPort } from 'serialport'

import type { SerialTrafficReporter } from './serial-traffic-reporter'

export interface ActivePortEvents {
  onClose: () => void
  onError: (error: Error) => void
}

export function listenToActivePort(
  port: SerialPort,
  traffic: SerialTrafficReporter,
  events: ActivePortEvents
): () => void {
  const decoder = new StringDecoder('utf8')
  const onData = (chunk: Buffer): void => {
    const text = decoder.write(chunk)
    if (text.length > 0) traffic.write('rx', text)
  }
  port.on('data', onData)
  port.once('close', events.onClose)
  port.on('error', events.onError)
  return () => {
    port.off('data', onData)
    port.off('close', events.onClose)
    port.off('error', events.onError)
  }
}
