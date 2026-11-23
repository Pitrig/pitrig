import type { ChipFacts } from './chip-facts'
import { RomCommand } from './rom-commands'
import type { RomSession } from './rom-session'

const SECURE_BOOT = 1 << 0
const SECURE_DOWNLOAD = 1 << 2

export interface SecurityState {
  chipId: number
  secured: boolean
}

export async function readSecurity(session: RomSession): Promise<SecurityState> {
  const { data } = await session.command(RomCommand.securityInfo, Buffer.alloc(0), {
    responseLength: 20
  })
  const flags = data.readUInt32LE(0)
  const encryptionCount = data[4] ?? 0
  return {
    chipId: data.readUInt32LE(12),
    secured:
      (flags & (SECURE_BOOT | SECURE_DOWNLOAD)) !== 0 || bitCount(encryptionCount) % 2 === 1
  }
}

export function readRevision(session: RomSession, facts: ChipFacts): Promise<number> {
  return facts.revision((address) => session.readRegister(address))
}

export async function readMac(session: RomSession, facts: ChipFacts): Promise<string> {
  const low = await session.readRegister(facts.macRegister)
  const high = await session.readRegister(facts.macRegister + 4)
  const bytes = Buffer.alloc(6)
  bytes.writeUInt16BE(high & 0xffff, 0)
  bytes.writeUInt32BE(low >>> 0, 2)
  return bytes.toString('hex').toUpperCase()
}

export async function holdWatchdogs(session: RomSession, facts: ChipFacts): Promise<void> {
  const watchdog = facts.watchdog
  await session.writeRegister(watchdog.protect, watchdog.key)
  await session.writeRegister(watchdog.config, 0)
  await session.writeRegister(watchdog.protect, 0)
  await session.writeRegister(watchdog.feedProtect, watchdog.feedKey)
  const feed = await session.readRegister(watchdog.feedConfig)
  await session.writeRegister(watchdog.feedConfig, feed | watchdog.autoFeed)
  await session.writeRegister(watchdog.feedProtect, 0)
}

export async function releaseForcedDownload(session: RomSession, facts: ChipFacts): Promise<void> {
  if (!facts.forcedDownload) return
  await session.writeRegister(facts.forcedDownload.register, 0, facts.forcedDownload.mask)
}

function bitCount(value: number): number {
  let count = 0
  for (let rest = value; rest > 0; rest >>= 1) count += rest & 1
  return count
}
