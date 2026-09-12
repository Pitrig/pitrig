import { app, nativeImage, type NativeImage } from 'electron'
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'

import icon from '../../resources/icon.png?asset'

const APP_NAME = 'Pitrig'

export const DEBUG_APP_NAME = 'Pitrig Debugger'

const LEGACY_USER_DATA = ['SimCore', join('@simcore', 'configurator')]

const OWNED_USER_DATA = [
  'configurations',
  'templates',
  'font-library',
  'font-catalog-cache',
  'preview-assets',
  'recent-configurations.json',
]

export function applyBranding(name: string = APP_NAME): void {
  app.setName(name)
  process.title = name
  if (name === APP_NAME) adoptLegacyUserData()
}

export function appIcon(): NativeImage {
  return nativeImage.createFromPath(icon)
}

export function applyDockIcon(): void {
  if (process.platform !== 'darwin') return
  app.dock?.setIcon(appIcon())
}

function adoptLegacyUserData(): void {
  const current = app.getPath('userData')
  for (const relative of LEGACY_USER_DATA) {
    const legacy = join(app.getPath('appData'), relative)
    if (existsSync(legacy)) adoptFrom(legacy, current)
  }
}

function adoptFrom(legacy: string, current: string): void {
  for (const entry of OWNED_USER_DATA) {
    const source = join(legacy, entry)
    const destination = join(current, entry)
    if (!existsSync(source) || existsSync(destination)) continue
    try {
      renameSync(source, destination)
    } catch (error) {
      console.error('[branding] could not move the previous user data', error)
      return
    }
  }
}
