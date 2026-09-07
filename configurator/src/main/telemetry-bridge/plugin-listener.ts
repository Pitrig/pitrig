import { createSocket, type Socket } from 'node:dgram'
import { performance } from 'node:perf_hooks'

import {
  LINK_ANY_ADDRESS,
  LINK_HEADER_BYTES,
  LINK_LOOPBACK_ADDRESS,
  LINK_MAGIC,
  LINK_MAXIMUM_PAYLOAD,
  LINK_VERSION
} from '@shared/telemetry-bridge'

const NEWLINE = 10
const RECEIVE_BUFFER_BYTES = 1 << 20
const SEQUENCE_MODULUS = 0x1_0000_0000
const REORDER_WINDOW = 8
const RESTART_GAP = 1_000

export interface LinkPacket {
  payload: Buffer
  address: string
  lost: number
  discarded: number
  at: number
}

export interface PluginListener {
  address: string
  port: number
  onPacket: (listener: (packet: LinkPacket) => void) => void
  onClose: (listener: (error?: Error) => void) => void
  close: () => Promise<void>
}

export async function openPluginListener(
  port: number,
  acceptFromNetwork: boolean
): Promise<PluginListener> {
  const address = acceptFromNetwork ? LINK_ANY_ADDRESS : LINK_LOOPBACK_ADDRESS
  const socket = createSocket({ type: 'udp4', recvBufferSize: RECEIVE_BUFFER_BYTES })
  await bind(socket, port, address)
  let expected: number | undefined
  return {
    address,
    port,
    onPacket: (listener) => {
      socket.on('message', (datagram, remote) => {
        const at = performance.now()
        const body = bodyOf(datagram)
        if (!body) return
        const sequence = datagram.readUInt32LE(3)
        const gap = expected === undefined ? 0 : distance(sequence - expected)
        if (gap < 0 && gap >= -REORDER_WINDOW) return
        expected = (sequence + 1) % SEQUENCE_MODULUS
        const lost = gap > 0 && gap <= RESTART_GAP ? gap : 0
        listener({ ...body, address: remote.address, lost, at })
      })
    },
    onClose: (listener) => {
      socket.once('close', () => listener())
      socket.on('error', (error) => listener(error))
    },
    close: () =>
      new Promise((resolve) => {
        socket.close(() => resolve())
      })
  }
}

function bind(socket: Socket, port: number, address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.bind({ port, address, exclusive: true }, () => {
      socket.removeListener('error', reject)
      resolve()
    })
  })
}

function distance(delta: number): number {
  const wrapped = ((delta % SEQUENCE_MODULUS) + SEQUENCE_MODULUS) % SEQUENCE_MODULUS
  return wrapped > SEQUENCE_MODULUS / 2 ? wrapped - SEQUENCE_MODULUS : wrapped
}

function bodyOf(datagram: Buffer): { payload: Buffer; discarded: number } | undefined {
  if (datagram.length <= LINK_HEADER_BYTES) return undefined
  if (datagram.toString('latin1', 0, 2) !== LINK_MAGIC) return undefined
  if (datagram[2] !== LINK_VERSION) return undefined
  const body = datagram.subarray(LINK_HEADER_BYTES)
  if (body.length > LINK_MAXIMUM_PAYLOAD) return undefined
  const boundary = body.lastIndexOf(NEWLINE)
  if (boundary < 0) return undefined
  return { payload: body.subarray(0, boundary + 1), discarded: body.length - boundary - 1 }
}
