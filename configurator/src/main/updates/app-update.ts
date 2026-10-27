import { app } from 'electron'
import electronUpdater, { type AppUpdater } from 'electron-updater'

import type { AppUpdateStatus } from '../../shared/app-updates'
import { latestRelease } from './release-feed'
import { isOlder } from '../../shared/version-compare'
import { t } from '@shared/ui-text'

export class AppUpdateTracker {
  private status: AppUpdateStatus
  private readonly updater: AppUpdater | undefined

  constructor(private readonly onChange: () => void) {
    const installable = process.platform === 'win32' && app.isPackaged
    this.status = { current: app.getVersion(), state: 'idle', installable }
    this.updater = installable ? this.attach(new electronUpdater.NsisUpdater()) : undefined
  }

  get(): AppUpdateStatus {
    return this.status
  }

  async check(): Promise<void> {
    if (this.status.state === 'downloading' || this.status.state === 'ready') return
    this.set({ state: 'checking', error: undefined })
    try {
      if (this.updater) {
        await this.updater.checkForUpdates()
        return
      }
      const release = await latestRelease()
      this.set({
        state: release && isOlder(this.status.current, release.version) ? 'available' : 'current',
        latest: release?.version
      })
    } catch (error) {
      this.set({ state: 'failed', error: messageOf(error) })
    }
  }

  install(): boolean {
    if (!this.updater || this.status.state !== 'ready') return false
    this.updater.quitAndInstall(true, true)
    return true
  }

  private attach(updater: AppUpdater): AppUpdater {
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.allowPrerelease = false
    updater.logger = null
    updater.on('update-available', (info) =>
      this.set({ state: 'downloading', latest: info.version, progress: 0 })
    )
    updater.on('update-not-available', (info) => this.set({ state: 'current', latest: info.version }))
    updater.on('download-progress', (progress) =>
      this.set({ state: 'downloading', progress: Math.round(progress.percent) })
    )
    updater.on('update-downloaded', (info) =>
      this.set({ state: 'ready', latest: info.version, progress: 100 })
    )
    updater.on('error', (error) => this.set({ state: 'failed', error: messageOf(error) }))
    return updater
  }

  private set(change: Partial<AppUpdateStatus>): void {
    this.status = { ...this.status, ...change }
    this.onChange()
  }
}

const MAXIMUM_ERROR_LENGTH = 160

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  if (text.includes('latest.yml')) return t('updates.app.noWindowsUpdate')
  return (text.split('\n')[0] ?? text).slice(0, MAXIMUM_ERROR_LENGTH)
}
