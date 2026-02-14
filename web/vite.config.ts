import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  publicDir: resolve(__dirname, '../assets'),
  resolve: {
    alias: {
      '@core': resolve(__dirname, '../core'),
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, '../dist-web'),
    emptyOutDir: true,
  },
});
