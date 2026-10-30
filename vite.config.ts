import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, process.cwd(), 'PUBLIC_').PUBLIC_BASE_PATH || './',
  envPrefix: 'PUBLIC_',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
}))
