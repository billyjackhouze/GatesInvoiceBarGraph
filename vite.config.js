import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 56', 'samsung >= 8', 'safari >= 11', 'ios >= 11'],
    }),
  ],

  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3006',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir:      'dist',
    emptyOutDir: true,
  },
})
