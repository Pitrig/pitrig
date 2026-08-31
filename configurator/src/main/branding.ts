import { app, nativeImage, type NativeImage } from 'electron'
import { existsSync, readdirSync, renameSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'

import icon from '../../resources/icon.png?asset'

const APP_NAME = 'SimCore'

const LEGACY_VENDOR_DIRECTORY = '@simcore'
const LEGACY_APPLICATION_DIRECTORY = 'configurator'

export function applyBranding(): void {
  app.setName(APP_NAME)
  process.title = APP_NAME
  adoptLegacyUserData()
}

export function appIcon(): NativeImage {
  return nativeImage.createFromPath(icon)
}

export function applyDockIcon(): void {
  if (process.platform !== 'darwin') return
  app.dock?.setIcon(appIcon())
}

function adoptLegacyUserData(): void {
  const vendor = join(app.getPath('appData'), LEGACY_VENDOR_DIRECTORY)
  const legacy = join(vendor, LEGACY_APPLICATION_DIRECTORY)
  const current = app.getPath('userData')
  if (!existsSync(legacy)) return
  try {
    if (existsSync(current)) {
      if (readdirSync(current).length > 0) return
      rmdirSync(current)
    }
    renameSync(legacy, current)
  } catch (error) {
    console.error('[branding] could not move the previous user data', error)
    return
  }
  try {
    rmdirSync(vendor)
  } catch {
    return
  }
}
