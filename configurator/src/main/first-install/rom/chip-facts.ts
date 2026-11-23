import type { InstallChip } from '../../../shared/first-install'

export type RegisterReader = (address: number) => Promise<number>

export interface WatchdogRegisters {
  config: number
  protect: number
  key: number
  feedConfig: number
  feedProtect: number
  feedKey: number
  autoFeed: number
}

export interface ChipFacts {
  chip: InstallChip
  name: string
  chipId: number
  macRegister: number
  spiBase: number
  watchdog: WatchdogRegisters
  forcedDownload?: { register: number; mask: number }
  revision: (read: RegisterReader) => Promise<number>
}

const S3_EFUSE = 0x6000_7000
const S3_BLOCK1 = S3_EFUSE + 0x44
const S3_BLOCK2 = S3_EFUSE + 0x5c
const S3_RTC = 0x6000_8000
const P4_EFUSE = 0x5012_d000
const P4_BLOCK1 = P4_EFUSE + 0x44
const P4_WATCHDOG = 0x5011_6000
const WATCHDOG_KEY = 0x50d8_3aa1

async function s3Revision(read: RegisterReader): Promise<number> {
  const word3 = await read(S3_BLOCK1 + 12)
  const word5 = await read(S3_BLOCK1 + 20)
  const minor = (((word5 >>> 23) & 0x1) << 3) | ((word3 >>> 18) & 0x7)
  const blockMajor = (await read(S3_BLOCK2 + 16)) & 0x3
  const blockMinor = (word3 >>> 24) & 0x7
  if ((minor & 0x7) === 0 && blockMajor === 1 && blockMinor === 1) return 0
  return ((word5 >>> 24) & 0x3) * 100 + minor
}

async function p4Revision(read: RegisterReader): Promise<number> {
  const word = await read(P4_BLOCK1 + 8)
  const major = (((word >>> 23) & 0x1) << 2) | ((word >>> 4) & 0x3)
  return major * 100 + (word & 0xf)
}

export const CHIP_FACTS: Record<InstallChip, ChipFacts> = {
  esp32s3: {
    chip: 'esp32s3',
    name: 'ESP32-S3',
    chipId: 9,
    macRegister: S3_BLOCK1,
    spiBase: 0x6000_2000,
    watchdog: {
      config: S3_RTC + 0x98,
      protect: S3_RTC + 0xb0,
      key: WATCHDOG_KEY,
      feedConfig: S3_RTC + 0xb4,
      feedProtect: S3_RTC + 0xb8,
      feedKey: 0x8f1d_312a,
      autoFeed: 0x8000_0000
    },
    forcedDownload: { register: 0x6000_812c, mask: 0x1 },
    revision: s3Revision
  },
  esp32p4: {
    chip: 'esp32p4',
    name: 'ESP32-P4',
    chipId: 18,
    macRegister: P4_BLOCK1,
    spiBase: 0x5008_d000,
    watchdog: {
      config: P4_WATCHDOG,
      protect: P4_WATCHDOG + 0x18,
      key: WATCHDOG_KEY,
      feedConfig: P4_WATCHDOG + 0x1c,
      feedProtect: P4_WATCHDOG + 0x20,
      feedKey: WATCHDOG_KEY,
      autoFeed: 1 << 18
    },
    revision: p4Revision
  }
}

export function chipWithId(chipId: number): ChipFacts | undefined {
  return Object.values(CHIP_FACTS).find((facts) => facts.chipId === chipId)
}

export function revisionLabel(revision: number): string {
  return `${Math.floor(revision / 100)}.${revision % 100}`
}
