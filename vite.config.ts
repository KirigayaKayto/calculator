/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const changelog = () => readFileSync(new URL('./src/changelog.json', import.meta.url), 'utf8')

/**
 * The changelog is bundled into the app for the "What's new" screen, and also served as
 * changelog.json next to it (not precached), so an older version of the app can read what
 * the update it is offering brings.
 */
function changelogFile(): Plugin {
  return {
    name: 'changelog-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'changelog.json', source: changelog() })
    },
    configureServer(server) {
      server.middlewares.use('/changelog.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(changelog())
      })
    },
  }
}

export default defineConfig({
  // relative paths: works both locally and from a GitHub Pages subfolder
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // mathjs, MathLive and the symbolic engine are most of the bundle; they are downloaded once
  // and then served from the offline cache (the symbolic engine is only loaded when needed)
  build: { chunkSizeWarningLimit: 12000 },
  worker: { format: 'es' },
  plugins: [
    svelte(),
    changelogFile(),
    VitePWA({
      // a new version waits until the person chooses "Update" (see src/lib/update.svelte.ts)
      registerType: 'prompt',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'Calculator',
        short_name: 'Calculator',
        description: 'A calculator for calculus and physics with textbook-style input',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#EEECE7',
        theme_color: '#EEECE7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // no json: changelog.json must always come from the network
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
