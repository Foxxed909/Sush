import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    // Two bridges, two bundles. `index` is the privileged one the main window
    // gets; `air` is the narrow one Air gets. They must stay separate files so
    // that loading Air's preload cannot pull in the privileged surface — a
    // shared bundle with a runtime branch would put every licensing, identity
    // and OAuth channel one typo away from being exposed.
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.js'),
          air: resolve('src/preload/air.js')
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          air: resolve('src/renderer/air.html')
        }
      }
    },
    // Pin a dedicated dev port so we don't collide with the default 5173/5174
    // that other Vite projects (or stale dev processes) grab. strictPort: false
    // lets it auto-increment if 5180 is also busy - the main process picks up the
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
