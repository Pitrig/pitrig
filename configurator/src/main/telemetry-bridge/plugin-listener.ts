import { createSocket, type Socket } from 'node:dgram'
import { lookup } from 'node:dns/promises'
import { performance } from 'node:perf_hooks'

import {
  LINK_ANY_ADDRESS,
  LINK_HEADER_BYTES,
  LINK_LOOPBACK_ADDRESS,
  LINK_MAGIC,
  LINK_MAXIMUM_PAYLOAD,
  LINK_VERSION,
  SOURCE_IDLE_MS,
  SUBSCRIBE_INTERVAL_MS,
  type PluginInput,
  type PluginStatus
} from '@shared/telemetry-bridge'
import { isPluginInput, isPluginStatus, parsePluginInput, parsePluginStatus } from './plugin-status'

const NEWLINE = 10
const CONTROL = 64
const RECEIVE_BUFFER_BYTES = 1 << 20
const SEQUENCE_MODULUS = 0x1_0000_0000
const REORDER_WINDOW = 8
const RESTART_GAP = 1_000

export interface LinkPacket {
  payload: Buffer
  address: string
  lost: number
  discarded: number
  rejected: boolean
  at: number
}

export interface PluginListenerRequest {
  port: number
  simhubHost: string
  simhubPort: number
  request: () => string
}

export interface PluginListener {
  port: number
  simhubAddress: string
  subscribeError: string | undefined
  onPacket: (listener: (packet: LinkPacket) => void) => void
  onStatus: (listener: (status: PluginStatus) => void) => void
  onInput: (listener: (input: PluginInput) => void) => void
  onClose: (listener: (error?: Error) => void) => void
  requestNow: () => Promise<void>
  close: () => Promise<void>
}

export async function openPluginListener(request: PluginListenerRequest): Promise<PluginListener> {
  const simhubAddress = await resolve(request.simhubHost)
  const address = isLoopback(simhubAddress) ? LINK_LOOPBACK_ADDRESS : LINK_ANY_ADDRESS
  const socket = createSocket({ type: 'udp4', recvBufferSize: RECEIVE_BUFFER_BYTES })
  try {
    await bind(socket, request.port, address)
  } catch (error) {
    socket.close()
    throw error
  }
  let subscribeError: string | undefined
  let closed = false
  const subscribe = (): Promise<void> =>
    new Promise((resolve) => {
      if (closed) {
        resolve()
        return
      }
      const datagram = subscribeDatagram(request.request())
      socket.send(datagram, request.simhubPort, simhubAddress, (error) => {
        subscribeError = error ? error.message : undefined
        resolve()
      })
    })
  const keepalive = setInterval(() => void subscribe(), SUBSCRIBE_INTERVAL_MS)
  void subscribe()
  let packetListener: ((packet: LinkPacket) => void) | undefined
  let statusListener: ((status: PluginStatus) => void) | undefined
  let inputListener: ((input: PluginInput) => void) | undefined
  let expected: number | undefined
  let previousAt = Number.NEGATIVE_INFINITY
  socket.on('message', (datagram, remote) => {
    if (remote.address !== simhubAddress) return
    const at = performance.now()
    const body = bodyOf(datagram)
    if (!body) return
    const sequence = datagram.readUInt32LE(3)
    const idle = at - previousAt >= SOURCE_IDLE_MS
    previousAt = at
    const gap = expected === undefined || idle ? 0 : distance(sequence - expected)
    if (gap < 0 && gap >= -REORDER_WINDOW) return
    expected = (sequence + 1) % SEQUENCE_MODULUS
    if (isPluginStatus(body.payload)) {
      statusListener?.(parsePluginStatus(body.payload.toString('latin1')))
      return
    }
    if (isPluginInput(body.payload)) {
      inputListener?.(parsePluginInput(body.payload.toString('utf8')))
      return
    }
    const lost = gap > 0 && gap <= RESTART_GAP ? gap : 0
    const rejected = hasControlLine(body.payload)
    packetListener?.({ ...body, address: remote.address, lost, at, rejected })
  })
  return {
    port: request.port,
    simhubAddress,
    get subscribeError() {
      return subscribeError
    },
    onPacket: (listener) => {
      packetListener = listener
    },
    onStatus: (listener) => {
      statusListener = listener
    },
    onInput: (listener) => {
      inputListener = listener
    },
    onClose: (listener) => {
      socket.once('close', () => listener())
      socket.on('error', (error) => listener(error))
    },
    requestNow: subscribe,
    close: () =>
      new Promise((resolve) => {
        clearInterval(keepalive)
        closed = true
        socket.close(() => resolve())
      })
  }
}

export function isLoopback(address: string): boolean {
  return address.startsWith('127.')
}

async function resolve(host: string): Promise<string> {
  const trimmed = host.trim()
  if (trimmed.length === 0) return LINK_LOOPBACK_ADDRESS
  const resolved = await lookup(trimmed, { family: 4 })
  return resolved.address
}

function subscribeDatagram(payload: string): Buffer {
  const body = Buffer.from(payload, 'utf8')
  const datagram = Buffer.alloc(LINK_HEADER_BYTES + body.length)
  datagram.write(LINK_MAGIC, 0, 'latin1')
  datagram[2] = LINK_VERSION
  body.copy(datagram, LINK_HEADER_BYTES)
  return datagram
}

function hasControlLine(payload: Buffer): boolean {
  if (payload[0] === CONTROL) return true
  for (
    let index = payload.indexOf(CONTROL);
    index > 0;
    index = payload.indexOf(CONTROL, index + 1)
  ) {
    if (payload[index - 1] === NEWLINE) return true
  }
  return false
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
