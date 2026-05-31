import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Transitional exception (change: add-test-safety-net).
  // App.tsx temporarily exports pure helpers alongside the App component so they can
  // be characterization-tested. The react-refresh rule is relaxed to 'warn' ONLY here;
  // it stays at its preset 'error' level repo-wide. Remove this block once the helpers
  // move into src/lib/ during the architecture refactor.
  {
    files: ['src/App.tsx'],
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
])
