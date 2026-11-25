import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

// Bugs only: undefined names, broken Hooks rules, unreachable or unused code.
// Formatting and style are not linted.
export default [
  { ignores: ['out/**', 'dist/**', 'dist-nightly/**', 'release/**', 'node_modules/**', 'resources/**', 'shots*/**', '.claude/**', '.github/**'] },
  js.configs.recommended,
  // A terminal app: ANSI/VT escapes in regexes are intentional.
  { rules: { 'no-control-regex': 'off' } },
  {
    files: ['src/renderer/**/*.{js,jsx,mjs}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 }
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    files: ['src/main/**/*.{js,mjs}', 'src/preload/**/*.js', 'tools/**/*.{js,mjs}', 'term/**/*.{js,mjs}', '*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2021, __SUSH_NIGHTLY__: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }]
    }
  },
  // Screenshot harnesses pass callbacks to page.evaluate, which run in the page.
  { files: ['tools/**/*.{js,mjs}'], languageOptions: { globals: { ...globals.browser } } },
  {
    files: ['tests/**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser, ...globals.es2021 } }
  }
]
