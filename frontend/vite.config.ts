import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const seoProxyTarget = process.env.SITEMAP_PROXY_TARGET ?? 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
  },
  server: {
    proxy: {
      '/sitemap.xml': seoProxyTarget,
      '/robots.txt': seoProxyTarget,
      '/compartir': seoProxyTarget,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
