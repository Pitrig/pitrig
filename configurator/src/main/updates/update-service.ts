import { app, powerMonitor, shell } from 'electron'

import {
  boardBehind,
  type InstallPluginResult,
  type PrepareFirmwareResult,
  type SimHubStatus,
  type UpdatePage,
  type UpdateStatus
} from '../../shared/app-updates'
import type { DeviceService } from '../device/device-service'
import type { FirmwareUpdateService } from '../firmware-update/firmware-update-service'
import { AppUpdateTracker } from './app-update'
import { LATEST_RELEASE_PAGE } from './release-feed'
import { RELEASED_FIRMWARE_VERSION, fetchReleasedFirmware } from './release-firmware'
import { describeSimHub, installPlugin, probeSimHub, simHubSupported } from './simhub-plugin'
import { t } from '@shared/ui-text'

const FIRST_CHECK_DELAY_MS = 8_000
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const SIMHUB_DOWNLOAD_PAGE = 'https://www.simhubdash.com/download-2/'

export class UpdateService {
  private readonly appUpdates = new AppUpdateTracker(() => this.publish())
  private readonly enabled = app.isPackaged || process.env.PITRIG_UPDATES === '1'
  private checkedAt: number | undefined
  private simhub: SimHubStatus | undefined
  private firmwareDownload: number | undefined
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly deviceService: DeviceService,
    private readonly firmware: FirmwareUpdateService,
    private readonly broadcast: (status: UpdateStatus) => void
  ) {}

  start(): void {
    if (!this.enabled || this.timer) return
    setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS).unref()
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS)
    this.timer.unref()
    powerMonitor.on('resume', () => {
      if (Date.now() - (this.checkedAt ?? 0) >= CHECK_INTERVAL_MS) void this.check()
    })
  }

  stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
  }

  status(): UpdateStatus {
    return {
      enabled: this.enabled,
      ...(this.checkedAt !== undefined ? { checkedAt: this.checkedAt } : {}),
      app: this.appUpdates.get(),
      releasedFirmware: RELEASED_FIRMWARE_VERSION,
      ...(this.firmwareDownload !== undefined ? { firmwareDownload: this.firmwareDownload } : {}),
      ...(this.simhub ? { simhub: this.simhub } : {})
    }
  }

  async check(): Promise<UpdateStatus> {
    if (!this.enabled) return this.status()
    await Promise.all([this.appUpdates.check(), this.checkSimHub()])
    this.checkedAt = Date.now()
    this.publish()
    return this.status()
  }

  installApp(): boolean {
    return this.appUpdates.install()
  }

  async openPage(page: UpdatePage): Promise<void> {
    await shell.openExternal(page === 'simhub' ? SIMHUB_DOWNLOAD_PAGE : LATEST_RELEASE_PAGE)
  }

  async prepareFirmware(): Promise<PrepareFirmwareResult> {
    const session = this.deviceService.getState().session
    if (!session) {
      return failure('device_error', t('device.deviceOperation.noPitrigDeviceIsConnected'))
    }
    if (!this.enabled || !boardBehind(session, RELEASED_FIRMWARE_VERSION)) {
      return failure('invalid_request', t('updates.firmware.nothingNewer'))
    }
    if (this.firmwareDownload !== undefined) {
      return failure('busy', t('updates.firmware.alreadyDownloading'))
    }
    this.firmwareDownload = 0
    this.publish()
    try {
      const path = await fetchReleasedFirmware(session.info.boardId, (fraction) => {
        this.firmwareDownload = Math.round(fraction * 100)
        this.publish()
      })
      return await this.firmware.adoptSource(path)
    } catch (error) {
      return failure('source_unreadable', messageOf(error))
    } finally {
      this.firmwareDownload = undefined
      this.publish()
    }
  }

  async installPlugin(closeSimHub: boolean): Promise<InstallPluginResult> {
    if (!simHubSupported()) {
      return { outcome: 'failed', message: t('updates.simhub.noSimHubFound') }
    }
    const result = await installPlugin(closeSimHub).catch(
      (error: unknown): InstallPluginResult => ({ outcome: 'failed', message: messageOf(error) })
    )
    await this.checkSimHub()
    this.publish()
    return result
  }

  private async checkSimHub(): Promise<void> {
    if (!simHubSupported()) return
    try {
      this.simhub = describeSimHub(await probeSimHub())
    } catch {
      this.simhub = undefined
    }
  }

  private publish(): void {
    this.broadcast(this.status())
  }
}

function failure(
  code: 'device_error' | 'invalid_request' | 'busy' | 'source_unreadable',
  message: string
): PrepareFirmwareResult {
  return { ok: false, error: { code, message } }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
