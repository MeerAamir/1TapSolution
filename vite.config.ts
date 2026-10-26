import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Fills the Supabase origin into the Content-Security-Policy in dist/_headers,
 * so the policy allows exactly the configured project (including custom domains).
 */
function cspOrigins(mode: string): Plugin {
  let outDir = 'dist'
  return {
    name: 'csp-supabase-origin',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir
    },
    closeBundle() {
      const env = loadEnv(mode, process.cwd(), 'VITE_')
      const raw = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
      let origin = 'https://*.supabase.co'
      try {
        if (raw) origin = new URL(raw).origin
      } catch {
        // keep the default when the URL is malformed
      }
      const ws = origin.replace(/^http/, 'ws')
      const file = join(outDir, '_headers')
      try {
        const text = readFileSync(file, 'utf8')
        writeFileSync(file, text.replaceAll('%SUPABASE_WS_ORIGIN%', ws).replaceAll('%SUPABASE_ORIGIN%', origin))
      } catch {
        // no _headers in this build
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), cspOrigins(mode)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // No manualChunks: route-level lazy imports already keep the dashboard,
    // charts (recharts) and PDF export (jspdf, dynamically imported) out of the
    // public pages. Forcing vendor chunks made the entry depend on them.
  },
}))
