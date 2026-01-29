import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';

// Check if SSL certificates exist (not available in CI)
const sslKeyPath = path.resolve(__dirname, '../ssl/key.pem');
const sslCertPath = path.resolve(__dirname, '../ssl/cert.pem');
const sslEnabled =
  !process.env.CI && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: sslEnabled ? 443 : 5173,
    https: sslEnabled
      ? {
          key: fs.readFileSync(sslKeyPath),
          cert: fs.readFileSync(sslCertPath),
        }
      : undefined,
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
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/integration': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/enforcement': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ingestion': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
