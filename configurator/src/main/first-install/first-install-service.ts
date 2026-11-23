import { setTimeout as sleep } from 'node:timers/promises'

import { app } from 'electron'
import { SerialPort } from 'serialport'

import {
  BOARD_INSTALL,
  type FirstInstallError,
  type FirstInstallProgress,
  type FirstInstallRequest,
  type FirstInstallResult,
  type FirstInstallStage
} from '../../shared/first-install'
import { usbPortKind } from '../../shared/usb-ports'
import type { ConfigLibraryService } from '../configs/config-library-service'
import type { DeviceService } from '../device/device-service'
import type { InstallClaim } from '../device/install-claim'
import { closePort, openPort } from '../device/serial-port-lifecycle'
import { backUpBoard } from '../firmware-update/board-backup'
import { fetchReleasedArchive, MissingReleaseAsset } from '../updates/release-firmware'
import { findExistingFirmware } from './existing-firmware'
import { flashBoard, type FlashState } from './flash-board'
import { cableMoves, connectInstalledBoard } from './install-handback'
import { InstallFailure } from './install-failure'
import { asInstallFailure, describeFailure } from './install-messages'
import { readReleaseArchive, type ReleaseArchive } from './release-archive'
import { ROM_BAUD_RATE } from './rom/rom-commands'
import { RomPortClosed } from './rom/rom-session'
import { t } from '@shared/ui-text'

const OPEN_ATTEMPTS = 3
const REOPEN_DELAY_MS = 1_000

export class FirstInstallService {
  private controller: AbortController | undefined

  constructor(
    private readonly deviceService: DeviceService,
    private readonly library: ConfigLibraryService,
    private readonly onProgress: (progress: FirstInstallProgress) => void
  ) {}

  cancel(): void {
    this.controller?.abort()
  }

  async install(request: FirstInstallRequest): Promise<FirstInstallResult> {
    if (this.controller) {
      return { ok: false, error: this.failed(new InstallFailure('busy'), { erased: false, address: 0 }) }
    }
    const controller = new AbortController()
    this.controller = controller
    const state: FlashState = { erased: false, address: 0 }
    const kept: { backup?: string } = {}
    try {
      const archive = await this.download(request, controller.signal)
      const connected = await this.deviceService.claimForInstall(request.portId, async (claim) => {
        kept.backup = await this.keepExisting(claim, request, controller.signal)
        const mac = await this.flash(claim, request, archive, controller.signal, state)
        return this.handBack(claim, request, mac, controller.signal)
      })
      return {
        ok: true,
        value: { version: app.getVersion(), connected, ...(kept.backup ? { backup: kept.backup } : {}) }
      }
    } catch (error) {
      const failure = controller.signal.aborted ? new InstallFailure('cancelled') : error
      return { ok: false, error: this.failed(failure, state, kept.backup) }
    } finally {
      this.controller = undefined
    }
  }

  private async download(request: FirstInstallRequest, signal: AbortSignal): Promise<ReleaseArchive> {
    const message = t('firmware.firstInstall.downloading', { version: app.getVersion() })
    this.report('download', 0, message)
    let bytes: Buffer
    try {
      bytes = await fetchReleasedArchive(
        request.board,
        (fraction) => this.report('download', fraction, message),
        signal
      )
    } catch (error) {
      if (error instanceof MissingReleaseAsset || signal.aborted) throw error
      const reason = error instanceof Error ? error.message : String(error)
      throw new InstallFailure('download_failed', { reason })
    }
    const profile = BOARD_INSTALL[request.board]
    const archive = readReleaseArchive(bytes, profile.release)
    if (archive.chip !== profile.chip) {
      throw new InstallFailure('archive_incomplete', { name: 'flasher_args.json' })
    }
    this.report('download', 1, message)
    return archive
  }

  private async keepExisting(
    claim: InstallClaim,
    request: FirstInstallRequest,
    signal: AbortSignal
  ): Promise<string | undefined> {
    if (request.manualBoot) return undefined
    this.report('connect', 0, t('firmware.firstInstall.checkingBoard'))
    const session = await findExistingFirmware(claim, request.board, signal)
    if (!session) return undefined
    if (session.firmware?.storageAvailable) throw new InstallFailure('already_pitrig')
    const saved = await backUpBoard(this.library, session, () =>
      this.report('connect', 0, t('firmware.boardUpdate.keepingACopy'))
    )
    if (!saved.ok) throw new InstallFailure('backup_failed', { reason: saved.message })
    return saved.value?.name
  }

  private async flash(
    claim: InstallClaim,
    request: FirstInstallRequest,
    archive: ReleaseArchive,
    signal: AbortSignal,
    state: FlashState
  ): Promise<string> {
    const kind = usbPortKind(claim.summary)
    if (kind === 'pitrig') throw new InstallFailure('no_answer')
    const transport = kind === 'usb_jtag' ? 'usb_jtag' : 'bridge'
    let autoReset = !request.manualBoot
    for (let attempt = 1; ; attempt += 1) {
      const port = new SerialPort({
        path: claim.path,
        baudRate: ROM_BAUD_RATE,
        autoOpen: false,
        lock: true
      })
      try {
        await openPort(port)
        return await flashBoard(
          {
            port,
            transport,
            autoReset,
            archive,
            signal,
            report: (stage, completed, total, name) =>
              this.report(stage, completed / Math.max(total, 1), stageMessage(stage, name))
          },
          state
        )
      } catch (error) {
        const closed = error instanceof RomPortClosed
        const retry = attempt < OPEN_ATTEMPTS && !state.erased && (closed || !port.isOpen)
        if (!retry || signal.aborted) throw error
        if (closed) autoReset = false
      } finally {
        await closePort(port)
      }
      await sleep(REOPEN_DELAY_MS)
    }
  }

  private async handBack(
    claim: InstallClaim,
    request: FirstInstallRequest,
    mac: string,
    signal: AbortSignal
  ): Promise<boolean> {
    const moves = cableMoves(claim, request.board)
    const message = moves
      ? t('firmware.firstInstall.moveCable')
      : t('firmware.firstInstall.waitingForPitrig')
    this.report('restart', 1, message, moves ? 'move_cable' : undefined)
    return connectInstalledBoard(claim, request.board, mac, signal)
  }

  private report(
    stage: FirstInstallStage,
    fraction: number,
    message: string,
    prompt?: 'move_cable'
  ): void {
    this.onProgress({
      stage,
      completed: Math.round(Math.min(1, Math.max(0, fraction)) * 1000),
      total: 1000,
      message,
      ...(prompt ? { prompt } : {})
    })
  }

  private failed(error: unknown, state: FlashState, backup?: string): FirstInstallError {
    const failure = asInstallFailure(error)
    return {
      code: failure.code,
      message: describeFailure(failure, state.erased),
      erased: state.erased,
      ...(backup ? { backup } : {})
    }
  }
}

function stageMessage(stage: FirstInstallStage, name?: string): string {
  switch (stage) {
    case 'connect':
      return t('firmware.firstInstall.connecting')
    case 'erase':
      return t('firmware.firstInstall.erasing')
    case 'write':
      return t('firmware.firstInstall.writing', { name: name ?? '' })
    case 'verify':
      return t('firmware.firstInstall.checking')
    case 'restart':
      return t('firmware.firstInstall.restarting')
    case 'download':
      return t('firmware.firstInstall.downloading', { version: app.getVersion() })
  }
}
