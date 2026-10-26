import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': { target: process.env.FAMPLAN_DEV_API_TARGET ?? 'http://localhost:3001', changeOrigin: true } },
  },
});
