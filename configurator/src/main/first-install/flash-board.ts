import type { SerialPort } from 'serialport'

import type { FirstInstallStage } from '../../shared/first-install'
import { erasePlan } from './erase-plan'
import { hex, InstallFailure } from './install-failure'
import type { ReleaseArchive } from './release-archive'
import { CHIP_FACTS, chipWithId, revisionLabel, type ChipFacts } from './rom/chip-facts'
import {
  holdWatchdogs,
  readMac,
  readRevision,
  readSecurity,
  releaseForcedDownload
} from './rom/rom-chip'
import {
  attachFlash,
  deflateImage,
  eraseRegion,
  flashMatches,
  readFlashSize,
  setFlashSize,
  writeDeflated
} from './rom/rom-flash'
import { resetIntoLoader, restartBoard, type ResetKind } from './rom/rom-reset'
import { RomPortClosed, RomRejected, RomSession, RomTimeout } from './rom/rom-session'

const BRIDGE_FLASH_BAUD_RATE = 460_800
const MEGABYTE = 1024 * 1024
const RESET_ROUNDS = 4
const SYNC_ATTEMPTS = 5
const MANUAL_SYNC_ATTEMPTS = 20

export type FlashReporter = (
  stage: FirstInstallStage,
  completed: number,
  total: number,
  name?: string
) => void

export interface FlashBoardRequest {
  port: SerialPort
  transport: ResetKind
  autoReset: boolean
  archive: ReleaseArchive
  signal: AbortSignal
  report: FlashReporter
}

export interface FlashState {
  erased: boolean
  address: number
}

export async function flashBoard(request: FlashBoardRequest, state: FlashState): Promise<string> {
  const session = new RomSession(request.port, request.signal)
  try {
    request.report('connect', 0, 1)
    await connect(session, request)
    const facts = await identify(session, request.archive)
    const mac = await readMac(session, facts)
    if (request.transport === 'usb_jtag') await holdWatchdogs(session, facts)
    await prepareFlash(session, facts, request.archive.flashSize)
    if (request.transport === 'bridge') await session.changeBaudRate(BRIDGE_FLASH_BAUD_RATE)
    request.report('connect', 1, 1)
    await erase(session, request, state)
    await write(session, request, state)
    await verify(session, request)
    request.report('restart', 0, 1)
    await releaseForcedDownload(session, facts)
    await restartBoard(request.port, request.transport)
    request.report('restart', 1, 1)
    return mac
  } catch (error) {
    throw romFailure(error, state)
  } finally {
    session.dispose()
  }
}

async function connect(session: RomSession, request: FlashBoardRequest): Promise<void> {
  if (!request.autoReset) {
    for (let attempt = 0; attempt < MANUAL_SYNC_ATTEMPTS; attempt += 1) {
      if (await session.sync()) return
      await session.pause(50)
    }
    throw new InstallFailure('no_answer')
  }
  for (let round = 0; round < RESET_ROUNDS; round += 1) {
    await resetIntoLoader(request.port, request.transport, round % 2 === 1).catch(
      (error: unknown) => {
        throw request.port.isOpen ? error : new RomPortClosed()
      }
    )
    for (let attempt = 0; attempt < SYNC_ATTEMPTS; attempt += 1) {
      if (await session.sync()) return
      await session.pause(50)
    }
  }
  throw new InstallFailure('no_answer')
}

async function identify(session: RomSession, archive: ReleaseArchive): Promise<ChipFacts> {
  const expected = CHIP_FACTS[archive.chip]
  const security = await readSecurity(session).catch((error: unknown) => {
    if (error instanceof RomRejected) return undefined
    throw error
  })
  const found = security ? chipWithId(security.chipId) : undefined
  if (!security || !found || found.chip !== archive.chip) {
    throw new InstallFailure('chip_mismatch', {
      found: found?.name ?? `#${security?.chipId ?? '?'}`,
      expected: expected.name
    })
  }
  if (security.secured) throw new InstallFailure('secured')
  const revision = await readRevision(session, found)
  const { minimum, maximum } = archive.revisions
  if (revision < minimum || revision > maximum) {
    throw new InstallFailure('revision_unsupported', {
      chip: found.name,
      revision: revisionLabel(revision),
      minimum: revisionLabel(minimum),
      maximum: revisionLabel(maximum)
    })
  }
  return found
}

async function prepareFlash(
  session: RomSession,
  facts: ChipFacts,
  flashSize: number
): Promise<void> {
  await attachFlash(session)
  const detected = await readFlashSize(session, facts)
  if (detected !== undefined && detected < flashSize) {
    throw new InstallFailure('flash_too_small', {
      size: detected / MEGABYTE,
      needed: flashSize / MEGABYTE
    })
  }
  await setFlashSize(session, flashSize)
}

async function erase(
  session: RomSession,
  request: FlashBoardRequest,
  state: FlashState
): Promise<void> {
  const regions = erasePlan(request.archive.parts, request.archive.flashSize)
  const total = regions.reduce((sum, region) => sum + region.size, 0)
  let erased = 0
  request.report('erase', 0, total)
  for (const region of regions) {
    session.ensureActive()
    state.erased = true
    state.address = region.offset
    await eraseRegion(session, region.offset, region.size)
    erased += region.size
    request.report('erase', erased, total)
  }
}

async function write(
  session: RomSession,
  request: FlashBoardRequest,
  state: FlashState
): Promise<void> {
  const packed = request.archive.parts.map((part) => ({ part, data: deflateImage(part.data) }))
  const total = packed.reduce((sum, entry) => sum + entry.data.length, 0)
  let base = 0
  request.report('write', 0, total, packed[0]?.part.name)
  for (const { part, data } of packed) {
    state.erased = true
    state.address = part.offset
    await writeDeflated(session, part.offset, part.data, data, (written) =>
      request.report('write', base + written, total, part.name)
    )
    base += data.length
  }
}

async function verify(session: RomSession, request: FlashBoardRequest): Promise<void> {
  const parts = request.archive.parts
  for (const [index, part] of parts.entries()) {
    request.report('verify', index, parts.length, part.name)
    if (!(await flashMatches(session, part.offset, part.data))) {
      throw new InstallFailure('verify_failed', { name: part.name })
    }
  }
  request.report('verify', parts.length, parts.length)
}

function romFailure(error: unknown, state: FlashState): unknown {
  if (error instanceof InstallFailure) return error
  if (error instanceof RomPortClosed && !state.erased) return error
  if (error instanceof RomTimeout || error instanceof RomRejected || error instanceof RomPortClosed) {
    return new InstallFailure(state.erased ? 'write_failed' : 'serial_error', {
      offset: hex(state.address)
    })
  }
  return error
}
