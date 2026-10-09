import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = `http://localhost:${process.env.PORT ?? 8787}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': api,
      '/uploads': api,
      '/buddypoke': api,
      '/bejeweled': api,
      '/patterns': api,
      '/og': api,
      '/kaartje': api,
    },
  },
})
