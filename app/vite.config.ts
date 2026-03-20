import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Compatível com Safari 12+ (iOS) e outros browsers modernos
    target: ['es2015', 'safari12', 'chrome75', 'firefox78', 'edge88'],
    cssTarget: ['safari12'],
  },
  esbuild: {
    // Garante sintaxe compatível com Safari mais antigo
    target: 'safari12',
  },
})
