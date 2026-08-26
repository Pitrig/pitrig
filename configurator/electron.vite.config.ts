import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export default defineConfig(({ command }) => ({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      lib: {
        entry: resolve('src/main/index.ts')
      }
    }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
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
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    }
  }
}))

function developmentCspPlugin(enabled: boolean): Plugin {
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
