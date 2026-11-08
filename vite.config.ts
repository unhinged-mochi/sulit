import { defineConfig } from 'vite'

export default defineConfig({
  // maplibre's worker is set explicitly in main.ts; pre-bundling would also break its self-located path in dev
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
