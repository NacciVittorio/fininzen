import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const certsDir = path.resolve(__dirname, '../certs')
const certFile = path.join(certsDir, 'localhost.pem')
const keyFile  = path.join(certsDir, 'localhost-key.pem')
const hasCerts = fs.existsSync(certFile) && fs.existsSync(keyFile)
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))

const backendProto = hasCerts ? 'https' : 'http'

// HIGH-23: Content-Security-Policy for the production SPA. Injected as a <meta>
// only on `vite build` (see cspMetaPlugin) so the dev server's HMR — which
// relies on inline scripts/styles and a WebSocket — keeps working unrestricted.
//   - script-src 'self': no inline scripts. Requires modulePreload.polyfill=false
//     below, otherwise Vite injects an inline polyfill that CSP would block.
//   - style-src keeps 'unsafe-inline': the design system and chart libs emit
//     runtime <style>/inline styles; style-based XSS is low-risk vs scripts.
//   - fonts.googleapis/gstatic: the IBM Plex Mono webfont loaded in index.html.
//   - connect-src 'self': API is same-origin (Caddy /api in prod, Vite proxy in
//     dev). frame-ancestors is omitted (ignored in <meta>; covered by the
//     X-Frame-Options/CSP header set by Caddy and SecurityHeadersMiddleware).
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

function cspMetaPlugin() {
  return {
    name: 'fininzen-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`
      return html.replace('</title>', `</title>\n    ${tag}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), cspMetaPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    // HIGH-22: do not ship source maps to production — they expose readable
    // source and inflate the deployed bundle. Flip to true locally if needed.
    sourcemap: false,
    // HIGH-23: drop Vite's inline modulepreload polyfill so the strict
    // `script-src 'self'` CSP above doesn't block it. Evergreen/iOS browsers
    // support <link rel=modulepreload> natively; without the polyfill, older
    // engines simply skip the preload hint (modules still load normally).
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5173,
    ...(hasCerts && {
      https: { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) },
    }),
    proxy: {
      '/api': `${backendProto}://localhost:8000`,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
    exclude: ['node_modules', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: ['src/__tests__/**', 'src/**/*.test.{js,jsx}'],
    },
  },
})
