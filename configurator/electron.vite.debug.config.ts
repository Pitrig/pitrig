import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

import {
  debugAlias,
  developmentCspPlugin,
  rendererAlias,
  sharedAlias
} from './electron.vite.shared'

const outDir = resolve('out-debug')

export default defineConfig(({ command }) => ({
  main: {
    resolve: { alias: { ...sharedAlias, ...debugAlias } },
    build: {
      outDir: resolve(outDir, 'main'),
      lib: {
        entry: resolve('src/debug/main/index.ts')
      }
    }
  },
  preload: {
    resolve: { alias: { ...sharedAlias, ...debugAlias } },
    build: {
      outDir: resolve(outDir, 'preload'),
      lib: {
        entry: resolve('src/debug/preload/index.ts'),
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
    root: resolve('src/debug/renderer'),
    plugins: [developmentCspPlugin(command === 'serve'), react(), tailwindcss()],
    resolve: { alias: { ...rendererAlias, ...debugAlias } },
    build: {
      outDir: resolve(outDir, 'renderer'),
      rollupOptions: {
        input: resolve('src/debug/renderer/index.html')
      }
    }
  }
}))
