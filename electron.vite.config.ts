import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

const __configDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * electron-vite: Preload-Rebuild loest nur Renderer-full-reload aus, nicht
 * Main-Neustart. Dann fehlen neue ipcMain-Handler ("No handler registered").
 * Nach dem ersten Preload-Bundle: Main-Eintrag anstossen -> Main-Watch -> Electron-Neustart.
 */
function touchMainEntryAfterPreloadRebuildPlugin(): Plugin {
  let isFirstBundle = true
  return {
    name: 'mailclient-touch-main-after-preload-rebuild',
    apply: 'build',
    closeBundle(): void {
      if (isFirstBundle) {
        isFirstBundle = false
        return
      }
      const mainEntry = path.resolve(__configDir, 'src/main/index.ts')
      try {
        const t = new Date()
        fs.utimesSync(mainEntry, t, t)
      } catch (e) {
        console.warn('[mailclient] Preload-Rebuild: Main-Eintrag touch fehlgeschlagen:', e)
      }
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __configDir, 'MAILCLIENT_')
  const publisherDefine: Record<string, string> = {
    'process.env.MAILCLIENT_MICROSOFT_CLIENT_ID': JSON.stringify(env.MAILCLIENT_MICROSOFT_CLIENT_ID ?? ''),
    'process.env.MAILCLIENT_GOOGLE_CLIENT_ID': JSON.stringify(env.MAILCLIENT_GOOGLE_CLIENT_ID ?? ''),
    'process.env.MAILCLIENT_GOOGLE_CLIENT_SECRET': JSON.stringify(env.MAILCLIENT_GOOGLE_CLIENT_SECRET ?? ''),
    'process.env.MAILCLIENT_NOTION_CLIENT_ID': JSON.stringify(env.MAILCLIENT_NOTION_CLIENT_ID ?? ''),
    'process.env.MAILCLIENT_NOTION_CLIENT_SECRET': JSON.stringify(
      env.MAILCLIENT_NOTION_CLIENT_SECRET ?? ''
    ),
    'process.env.MAILCLIENT_REMOTE_OAUTH_CONFIG_URL': JSON.stringify(
      env.MAILCLIENT_REMOTE_OAUTH_CONFIG_URL ?? ''
    ),
    'process.env.MAILCLIENT_PRIVACY_URL': JSON.stringify(env.MAILCLIENT_PRIVACY_URL ?? ''),
    'process.env.MAILCLIENT_HELP_URL': JSON.stringify(env.MAILCLIENT_HELP_URL ?? '')
  }

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: publisherDefine,
      resolve: {
        alias: {
          '@shared': path.resolve(__configDir, 'src/shared'),
          '@main': path.resolve(__configDir, 'src/main')
        }
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin(), touchMainEntryAfterPreloadRebuildPlugin()],
      resolve: {
        alias: {
          '@shared': path.resolve(__configDir, 'src/shared')
        }
      }
    },
    renderer: {
      root: path.resolve(__configDir, 'src/renderer'),
      resolve: {
        alias: {
          '@': path.resolve(__configDir, 'src/renderer/src'),
          '@shared': path.resolve(__configDir, 'src/shared')
        }
      },
      build: {
        rollupOptions: {
          input: {
            index: path.resolve(__configDir, 'src/renderer/index.html')
          },
          output: {
            manualChunks(id: string): string | undefined {
              if (id.includes('node_modules/@fullcalendar')) return 'fullcalendar'
              if (id.includes('node_modules/@tiptap') || id.includes('node_modules/prosemirror')) {
                return 'tiptap'
              }
              if (id.includes('node_modules/@uiw/react-md-editor')) return 'md-editor'
              if (id.includes('node_modules/lucide-react')) return 'lucide'
              if (id.includes('node_modules/date-fns')) return 'date-fns'
              if (id.includes('node_modules/@dnd-kit')) return 'dnd-kit'
              return undefined
            }
          }
        }
      },
      plugins: [
        react(),
        process.env.ANALYZE_BUNDLE === '1'
          ? visualizer({
              filename: path.resolve(__configDir, 'out/stats/renderer.html'),
              gzipSize: true,
              open: false
            })
          : undefined
      ].filter(Boolean)
    }
  }
})
