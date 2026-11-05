import { defineConfig } from 'vitest/config'

// Sush's test run: tests/ only (term/ tests live there too).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.{mjs,js}'],
    exclude: ['**/node_modules/**', 'out/**', 'dist/**']
  }
})
