import type { SerialPort } from 'serialport'

const CLOSE_TIMEOUT_MS = 2_000

export function openPort(port: SerialPort): Promise<void> {
  return new Promise((resolve, reject) => {
    port.open((error) => (error ? reject(error) : resolve()))
  })
}

export function closePort(port: SerialPort | undefined): Promise<void> {
  if (!port?.isOpen) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, CLOSE_TIMEOUT_MS)
    port.close(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}
