import type { BridgeSource } from './bridge-source'

const HOSTED_PLATFORM = 'darwin'
const PTY_COLUMNS = 80
const PTY_ROWS = 24

interface PtyStream {
  on: (event: string, listener: (payload: never) => void) => unknown
  destroy: () => void
}

interface OpenedPty {
  _pty: string
  _master: PtyStream
  _slave: PtyStream
}

interface PtyModule {
  open: (options: { cols: number; rows: number; encoding: null }) => OpenedPty
}

export function hostingSupported(): boolean {
  return process.platform === HOSTED_PLATFORM
}

export async function openHostedSource(): Promise<BridgeSource> {
  const loaded = await import('node-pty')
  const module = ((loaded as { default?: unknown }).default ?? loaded) as PtyModule
  const opened = module.open({ cols: PTY_COLUMNS, rows: PTY_ROWS, encoding: null })
  const master = opened._master
  const slave = opened._slave
  master.on('error', (() => undefined) as never)
  slave.on('error', (() => undefined) as never)
  return {
    path: opened._pty,
    onData: (listener) => {
      master.on('data', listener as never)
    },
    onClose: (listener) => {
      master.on('close', (() => listener()) as never)
    },
    close: () => {
      master.destroy()
      slave.destroy()
      return Promise.resolve()
    }
  }
}
