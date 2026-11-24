import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Porta 3000: è il site_url di Supabase (backend/supabase/config.toml), dove portano i link d'invito.
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
  preview: { host: '127.0.0.1', port: 3000, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
})
