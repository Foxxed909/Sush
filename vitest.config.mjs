import { defineConfig } from 'vitest/config'

// Unit tests target the pure logic modules (intent parsing, agent resolution,
// command frequency, shell parsing) — no DOM needed, so the fast Node env.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,mjs}'],
    globals: true
  }
})
