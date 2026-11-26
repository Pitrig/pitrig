export const RomCommand = {
  flashBegin: 0x02,
  sync: 0x08,
  writeRegister: 0x09,
  readRegister: 0x0a,
  spiSetParameters: 0x0b,
  spiAttach: 0x0d,
  changeBaudRate: 0x0f,
  flashDeflateBegin: 0x10,
  flashDeflateData: 0x11,
  spiFlashMd5: 0x13,
  securityInfo: 0x14
} as const

export const ROM_BAUD_RATE = 115_200
export const FLASH_BLOCK_SIZE = 0x400

export const SYNC_PAYLOAD = Buffer.concat([
  Buffer.from([0x07, 0x07, 0x12, 0x20]),
  Buffer.alloc(32, 0x55)
])

export interface RomResponse {
  op: number
  value: number
  data: Buffer
}

export function checksum(data: Uint8Array): number {
  let value = 0xef
  for (const byte of data) value ^= byte
  return value
}

export function words(...values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4)
  values.forEach((value, index) => buffer.writeUInt32LE(value >>> 0, index * 4))
  return buffer
}

export function commandPacket(op: number, data: Uint8Array, check: number): Buffer {
  const packet = Buffer.alloc(8 + data.length)
  packet[0] = 0x00
  packet[1] = op
  packet.writeUInt16LE(data.length, 2)
  packet.writeUInt32LE(check >>> 0, 4)
  packet.set(data, 8)
  return packet
}

export function parseResponse(frame: Buffer): RomResponse | undefined {
  if (frame.length < 8 || frame[0] !== 0x01) return undefined
  return { op: frame.readUInt8(1), value: frame.readUInt32LE(4), data: frame.subarray(8) }
}

export function beginPayload(eraseSize: number, blocks: number, offset: number): Buffer {
  return words(eraseSize, blocks, FLASH_BLOCK_SIZE, offset, 0)
}

export function deflateDataPayload(sequence: number, block: Uint8Array): Buffer {
  return Buffer.concat([words(block.length, sequence, 0, 0), block])
}

export function attachPayload(): Buffer {
  return Buffer.alloc(8)
}

export function parametersPayload(flashSize: number): Buffer {
  return words(0, flashSize, 0x10000, 0x1000, 0x100, 0xffff)
}

export function md5Payload(offset: number, size: number): Buffer {
  return words(offset, size, 0, 0)
}
