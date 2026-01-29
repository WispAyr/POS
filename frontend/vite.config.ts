import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 443,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '../ssl/key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '../ssl/cert.pem')),
    },
    host: '0.0.0.0',
    strictPort: false,
    // @ts-ignore - allowedHosts is a valid Vite 7 option
    allowedHosts: [
      'processing-two.parkwise.noc',
      'localhost',
      '127.0.0.1',
      '.parkwise.noc', // Allow all subdomains
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/integration': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/enforcement': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ingestion': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
