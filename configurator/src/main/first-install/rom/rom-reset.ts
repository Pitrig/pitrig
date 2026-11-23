import { setTimeout as sleep } from 'node:timers/promises'

import type { SerialPort } from 'serialport'

export type ResetKind = 'bridge' | 'usb_jtag'

export function setLines(port: SerialPort, dtr: boolean, rts: boolean): Promise<void> {
  return new Promise((resolve, reject) =>
    port.set({ dtr, rts }, (error) => (error ? reject(error) : resolve()))
  )
}

export async function resetIntoLoader(
  port: SerialPort,
  kind: ResetKind,
  slow: boolean
): Promise<void> {
  if (kind === 'usb_jtag') {
    await setLines(port, false, false)
    await sleep(100)
    await setLines(port, true, false)
    await sleep(100)
    await setLines(port, true, true)
    await setLines(port, false, true)
    await sleep(100)
    await setLines(port, false, false)
    return
  }
  await setLines(port, false, false)
  await setLines(port, true, true)
  await setLines(port, false, true)
  await sleep(100)
  await setLines(port, true, false)
  await sleep(slow ? 550 : 50)
  await setLines(port, false, false)
}

export async function restartBoard(port: SerialPort, kind: ResetKind): Promise<void> {
  const usb = kind === 'usb_jtag'
  await setLines(port, false, true)
  await sleep(usb ? 200 : 100)
  await setLines(port, false, false)
  if (usb) await sleep(200)
}
