import { defineConfig } from 'vite'

export default defineConfig({
  // maplibre v6 finds its worker relative to its own module; pre-bundling moves the module and breaks that path
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
