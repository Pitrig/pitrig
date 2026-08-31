import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export const sharedAlias = {
  '@shared': resolve('src/shared')
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
    name: 'simcore-development-csp',
    transformIndexHtml: (html) =>
      enabled
        ? html.replace(
            "connect-src 'self'",
            "connect-src 'self' ws://localhost:* http://localhost:*"
          )
        : html
  }
}
