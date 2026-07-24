import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Air's build, and only Air's. There is no second input here and there never
// should be: the moment this config knows about another product, the two are
// one application again.
//
// No Tailwind, no PostCSS chain. air.css is hand-written and is the entire
// stylesheet — a design system small enough to read in one sitting does not
// need a utility framework to generate it.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve('.'),
    build: {
      rollupOptions: {
        input: { index: resolve('index.html') }
      }
    },
    // Sush dev-serves on 5180. Air takes 5190 so both can run at once — they
    // are separate apps, and a developer working on one should never have to
    // stop the other.
    server: {
      port: 5190,
      strictPort: false
    },
    plugins: [react()]
  }
})
