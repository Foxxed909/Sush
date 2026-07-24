import { defineConfig } from 'vitest/config'

// Sush's test run, and only Sush's.
//
// `air/` is a separate application with its own package.json, its own
// node_modules and its own `npm test`. Without this exclusion Vitest's default
// glob walks into it and Sush's suite silently starts depending on Air being
// installed — which is precisely the coupling that splitting them was meant to
// remove. Two applications, two test runs.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.{mjs,js}'],
    exclude: ['**/node_modules/**', 'air/**', 'out/**', 'dist/**']
  }
})
