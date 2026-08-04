import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export default defineConfig(({ command }) => ({
  main: {
    build: {
      lib: {
        entry: {
          index: resolve('src/main/index.ts'),
          'font-converter-worker': resolve('src/main/font-assets/font-converter-worker.ts')
        }
      },
      rollupOptions: {
        output: {
          entryFileNames: '[name].js'
        }
      }
    }
  },
  preload: {
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
        '@': resolve('src/renderer/src')
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
