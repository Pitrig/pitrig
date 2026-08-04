import type { SerialPort } from 'serialport'

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
    port.close(() => resolve())
  })
}
