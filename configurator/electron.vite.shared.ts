import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

import { readFirmwareChanges } from './electron.vite.changelog'

export const sharedAlias = {
  '@shared': resolve('src/shared')
}

export const releaseDefine = {
  __PITRIG_FIRMWARE_VERSION__: JSON.stringify(
    readFileSync(resolve('../firmware/version.txt'), 'utf8').trim()
  ),
  __PITRIG_OFFICIAL_BUILD__: JSON.stringify(process.env.PITRIG_OFFICIAL_BUILD === '1')
}

export const rendererDefine = {
  __PITRIG_FIRMWARE_CHANGES__: JSON.stringify(readFirmwareChanges())
}

export const rendererAlias = {
  '@': resolve('src/renderer/src'),
  ...sharedAlias
}

export const debugAlias = {
  '@main': resolve('src/main'),
  '@debug-shared': resolve('src/debug/shared')
}

export function developmentCspPlugin(enabled: boolean): Plugin {
  return {
    name: 'pitrig-development-csp',
    transformIndexHtml: (html) =>
      enabled
        ? html.replace(
            "connect-src 'self'",
            "connect-src 'self' ws://localhost:* http://localhost:*"
          )
        : html
  }
}
