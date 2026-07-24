import { defineConfig } from 'vitest/config'

// Air's test run, and only Air's.
//
// Without this file Vitest walks *upward* out of `air/` looking for a config
// and finds Sush's, which imports `vitest` from Sush's node_modules — a package
// Air's install does not have. Locally that resolves and the suite passes,
// because both node_modules happen to be on the same disk. On CI, where the Air
// job only installs inside `air/`, it fails outright.
//
// Which is the split's own point arriving from the other direction: a shared
// config is a dependency, and a dependency that only works because of what
// happens to be lying around next to it is the worst kind. Air's config lives
// in Air.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['tests/**/*.test.{mjs,js}'],
    exclude: ['**/node_modules/**', 'out/**', 'dist/**']
  }
})
