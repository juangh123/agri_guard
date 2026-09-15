import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const mapLibreDist = dirname(fileURLToPath(import.meta.resolve('maplibre-gl')))

// MapLibre resolves its worker relative to the bundled runtime chunk. Vite cannot
// infer those files from that runtime URL, so emit the worker and its shared
// module using the exact filenames MapLibre expects.
function mapLibreWorkerAssets() {
  return {
    name: 'maplibre-worker-assets',
    generateBundle() {
      for (const filename of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
        this.emitFile({
          type: 'asset',
          fileName: `assets/${filename}`,
          source: readFileSync(join(mapLibreDist, filename)),
        })
      }
    },
  }
}

const proxy = {
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
  },
  // WebSocket proxy: forwards /ws/* (e.g. /ws/alerts/) to Django Channels
  '/ws': {
    target: 'http://localhost:8000',
    ws: true,
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mapLibreWorkerAssets()],
  server: {
    // Development tunnels use random hostnames; production builds are unaffected.
    allowedHosts: true,
    proxy,
  },
  preview: {
    // Keep the built demo reachable through random Cloudflare tunnel hostnames.
    allowedHosts: true,
    proxy,
  },
})
