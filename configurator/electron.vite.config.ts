import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

import { developmentCspPlugin, rendererAlias, sharedAlias } from './electron.vite.shared'

export default defineConfig(({ command }) => ({
  main: {
    resolve: { alias: sharedAlias },
    build: {
      lib: {
        entry: resolve('src/main/index.ts')
      },
      rollupOptions: {
        treeshake: {
          moduleSideEffects: 'no-external'
        }
      }
    }
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: {
      lib: {
        entry: resolve('src/preload/index.ts'),
        formats: ['cjs']
      },
      rollupOptions: {
        output: {
          entryFileNames: 'index.cjs'
        }
      }
    }
  },
  renderer: {
    plugins: [developmentCspPlugin(command === 'serve'), react(), tailwindcss()],
    resolve: { alias: rendererAlias }
  }
}))
