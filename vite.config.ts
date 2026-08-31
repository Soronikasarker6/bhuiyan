/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/** `SINGLE=1 vite build` produces one self-contained, double-clickable file. */
const single = process.env.SINGLE === '1'

/**
 * `GH_PAGES=true vite build` (set by .github/workflows/deploy.yml) builds
 * for GitHub Pages, which serves this project from a sub-path —
 * https://<user>.github.io/bhuiyan/ — rather than a domain root. Every
 * asset URL has to carry that `/bhuiyan/` prefix, and `import.meta.env.BASE_URL`
 * (which mirrors this value at runtime) is what tells the router the same
 * thing — see the `basename` logic in `src/main.tsx`.
 *
 * Everywhere else this stays relative: a build with an absolute '/assets/...'
 * base only works when served from a known root, whereas './assets/...'
 * also works when someone double-clicks index.html out of a folder, which is
 * how this is actually opened in the office.
 */
const ghPages = process.env.GH_PAGES === 'true'

export default defineConfig({
  base: ghPages ? '/bhuiyan/' : './',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: single ? 'dist-single' : 'dist',
    sourcemap: false,
    // A single-file build puts the whole application into one inline script.
    // Chrome and Edge refuse to load an EXTERNAL module script over file://
    // — the origin is null, so it fails CORS — which is why a normal
    // multi-chunk build shows a blank page when index.html is double-clicked.
    // An INLINE module has nothing to fetch, so it runs.
    cssCodeSplit: !single,
    assetsInlineLimit: single ? 100_000_000 : 4096,
    rollupOptions: {
      output: single
        ? { inlineDynamicImports: true }
        : {
            // Recharts is by far the heaviest dependency and only the
            // dashboard and reports need it; splitting keeps first paint on
            // the entry screens fast on a factory-office connection.
            manualChunks: {
              charts: ['recharts'],
              vendor: ['react', 'react-dom', 'react-router-dom'],
            },
          },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
