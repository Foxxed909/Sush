import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// Flat ESLint config. Goal: catch real bugs (undefined vars, broken Hooks
// rules, unreachable code) without drowning a large, working, inline-styled
// React codebase in stylistic noise — Prettier owns formatting, not ESLint.
export default [
  { ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'resources/**'] },
  js.configs.recommended,
  {
    // This is a terminal emulator: ANSI/VT escape sequences (\x1b, \x07, …) in
    // regexes are intentional and pervasive, not a mistake.
    rules: { 'no-control-regex': 'off' }
  },
  {
    files: ['src/renderer/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 }
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_|^React$' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    files: ['src/main/**/*.{js,mjs}', 'src/preload/**/*.js', 'tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2021 }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['**/*.test.{js,mjs}', 'vitest.config.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021 }
    }
  }
]
