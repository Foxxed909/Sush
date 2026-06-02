import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // Pin a dedicated dev port so we don't collide with the default 5173/5174
    // that other Vite projects (or stale dev processes) grab. strictPort: false
    // lets it auto-increment if 5180 is also busy — the main process picks up the
    // real URL from process.env.ELECTRON_RENDERER_URL either way.
    server: {
      port: 5180,
      strictPort: false
    },
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()]
      }
    },
    plugins: [react()]
  }
})
