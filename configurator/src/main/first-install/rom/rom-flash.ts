import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'

import type { ChipFacts } from './chip-facts'
import {
  attachPayload,
  beginPayload,
  checksum,
  deflateDataPayload,
  FLASH_BLOCK_SIZE,
  md5Payload,
  parametersPayload,
  RomCommand
} from './rom-commands'
import { DEFAULT_TIMEOUT_MS, RomRejected, RomTimeout, type RomSession } from './rom-session'

const MEGABYTE = 1024 * 1024
const ERASE_SECONDS_PER_MEGABYTE = 40
const MD5_SECONDS_PER_MEGABYTE = 8
const BLOCK_TIMEOUT_MS = 10_000
const BLOCK_ATTEMPTS = 3
const SPI_COMMAND_START = 1 << 18
const READ_IDENTIFICATION = 0x9f

function scaledTimeout(secondsPerMegabyte: number, size: number): number {
  return Math.max(DEFAULT_TIMEOUT_MS, Math.ceil((secondsPerMegabyte * 1000 * size) / MEGABYTE))
}

export async function attachFlash(session: RomSession): Promise<void> {
  await session.command(RomCommand.spiAttach, attachPayload())
}

export async function setFlashSize(session: RomSession, flashSize: number): Promise<void> {
  await session.command(RomCommand.spiSetParameters, parametersPayload(flashSize))
}

export async function readFlashSize(
  session: RomSession,
  facts: ChipFacts
): Promise<number | undefined> {
  const base = facts.spiBase
  const command = base
  const user = base + 0x18
  const user2 = base + 0x20
  const readLength = base + 0x28
  const data = base + 0x58
  const savedUser = await session.readRegister(user)
  const savedUser2 = await session.readRegister(user2)
  await session.writeRegister(readLength, 24 - 1)
  await session.writeRegister(user, (1 << 31) | (1 << 28))
  await session.writeRegister(user2, (7 << 28) | READ_IDENTIFICATION)
  await session.writeRegister(data, 0)
  await session.writeRegister(command, SPI_COMMAND_START)
  let finished = false
  for (let attempt = 0; attempt < 10 && !finished; attempt += 1) {
    finished = ((await session.readRegister(command)) & SPI_COMMAND_START) === 0
  }
  const identification = await session.readRegister(data)
  await session.writeRegister(user, savedUser)
  await session.writeRegister(user2, savedUser2)
  return finished ? sizeFromIdentification(identification) : undefined
}

function sizeFromIdentification(identification: number): number | undefined {
  const code = (identification >>> 16) & 0xff
  if (code >= 0x12 && code <= 0x1c) return 2 ** code
  if (code >= 0x20 && code <= 0x22) return 2 ** (code - 6)
  if (code >= 0x32 && code <= 0x3a) return 2 ** (code - 0x20)
  return undefined
}

export async function eraseRegion(session: RomSession, offset: number, size: number): Promise<void> {
  const blocks = Math.ceil(size / FLASH_BLOCK_SIZE)
  await session.command(RomCommand.flashBegin, beginPayload(size, blocks, offset), {
    timeoutMs: scaledTimeout(ERASE_SECONDS_PER_MEGABYTE, size)
  })
}

export function deflateImage(image: Uint8Array): Buffer {
  return deflateSync(image, { level: 9 })
}

export async function writeDeflated(
  session: RomSession,
  offset: number,
  image: Uint8Array,
  packed: Buffer,
  onBlock: (written: number) => void
): Promise<void> {
  const blocks = Math.ceil(packed.length / FLASH_BLOCK_SIZE)
  const eraseSize = Math.ceil(image.length / FLASH_BLOCK_SIZE) * FLASH_BLOCK_SIZE
  await session.command(RomCommand.flashDeflateBegin, beginPayload(eraseSize, blocks, offset), {
    timeoutMs: scaledTimeout(ERASE_SECONDS_PER_MEGABYTE, eraseSize)
  })
  for (let sequence = 0; sequence < blocks; sequence += 1) {
    const end = Math.min(packed.length, (sequence + 1) * FLASH_BLOCK_SIZE)
    await sendBlock(session, sequence, packed.subarray(sequence * FLASH_BLOCK_SIZE, end))
    onBlock(end)
  }
}

export async function flashMatches(
  session: RomSession,
  offset: number,
  image: Uint8Array
): Promise<boolean> {
  const { data } = await session.command(RomCommand.spiFlashMd5, md5Payload(offset, image.length), {
    responseLength: 32,
    timeoutMs: scaledTimeout(MD5_SECONDS_PER_MEGABYTE, image.length)
  })
  const expected = createHash('md5').update(image).digest('hex')
  return data.toString('ascii').toLowerCase() === expected
}

async function sendBlock(session: RomSession, sequence: number, block: Buffer): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await session.command(RomCommand.flashDeflateData, deflateDataPayload(sequence, block), {
        check: checksum(block),
        timeoutMs: BLOCK_TIMEOUT_MS
      })
      return
    } catch (error) {
      const retryable = error instanceof RomTimeout || error instanceof RomRejected
      if (!retryable || attempt >= BLOCK_ATTEMPTS) throw error
    }
  }
}
