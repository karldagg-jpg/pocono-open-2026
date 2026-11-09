import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Files in public/ that the app needs offline as well as the built ones.
const PUBLIC_FILES = ['manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']

// Writes sw.js into the build with every file the app needs, so it can be kept
// on the phone. The version is a hash of those file names, which change with
// every build that changes anything.
function serviceWorker() {
  return {
    name: 'pocono-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js' && f !== 'index.html')
      const assets = [...built, ...PUBLIC_FILES].sort()
      const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12)
      const source = readFileSync(new URL('./sw/sw-template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__ASSETS__', JSON.stringify(assets))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  base: "/pocono-open-2026/",
  build: {
    rolldownOptions: {
      output: {
        // Firebase and React change rarely; in files of their own they stay
        // saved on the phone when only the app changes.
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase|idb|tslib)[\\/]/, priority: 2 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
})
