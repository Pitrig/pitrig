import type { SerialPort } from 'serialport'

export interface LineOutcome<T> {
  value?: T
  error?: Error
}

export interface LineExchangeOptions<T> {
  timeoutMs: number
  bufferLimit: number
  consume: (lines: readonly string[]) => LineOutcome<T> | undefined
  onTimeout: () => LineOutcome<T>
  onClose: () => Error
  send: (fail: (error: Error) => void, isSettled: () => boolean) => void
  onReceive?: (text: string) => void
  signal?: AbortSignal
  onAbort?: () => Error
}

export function exchangeLines<T>(
  port: SerialPort,
  options: LineExchangeOptions<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let buffer = ''
    let settled = false

    const cleanup = (): void => {
      clearTimeout(timeoutTimer)
      port.off('data', onData)
      port.off('error', onError)
      port.off('close', onClose)
      options.signal?.removeEventListener('abort', onAbort)
      buffer = ''
    }
    const settle = (outcome: LineOutcome<T>): void => {
      if (settled) return
      settled = true
      cleanup()
      if (outcome.error) reject(outcome.error)
      else resolve(outcome.value as T)
    }
    const fail = (error: Error): void => settle({ error })
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      options.onReceive?.(text)
      buffer = (buffer + text).slice(-options.bufferLimit)
      const lines = buffer.replaceAll('\r', '').split('\n')
      buffer = lines.pop() ?? ''
      const outcome = options.consume(lines)
      if (outcome) settle(outcome)
    }
    const onError = (error: Error): void => fail(error)
    const onClose = (): void => fail(options.onClose())
    const onAbort = (): void => fail(options.onAbort?.() ?? new Error('The request was cancelled.'))

    port.on('data', onData)
    port.once('error', onError)
    port.once('close', onClose)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    const timeoutTimer = setTimeout(() => settle(options.onTimeout()), options.timeoutMs)
    if (options.signal?.aborted) {
      onAbort()
      return
    }
    options.send(fail, () => settled)
  })
}
