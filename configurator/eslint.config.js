import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const productSources = [
  'src/main/**/*.{ts,tsx}',
  'src/preload/**/*.{ts,tsx}',
  'src/renderer/**/*.{ts,tsx}',
  'src/shared/**/*.{ts,tsx}'
]

export default tseslint.config(
  { ignores: ['node_modules', 'out', 'out-debug'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: productSources,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/debug/**', '@debug-shared/*'],
              message:
                'The product must not import debug code. Debug tooling lives in src/debug and depends on the product, never the other way round.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/renderer/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[A-Za-z]{2}/]',
          message:
            'User-visible text belongs in i18n/en.json. Draw it with t() from @shared/ui-text.'
        },
        {
          selector:
            'JSXAttribute[name.name=/^(alt|aria-description|aria-label|buttonLabel|caption|description|hint|label|message|placeholder|summary|title)$/] > Literal[value=/[A-Za-z]{2}/]',
          message:
            'User-visible text belongs in i18n/en.json. Draw it with t() from @shared/ui-text.'
        }
      ]
    }
  },
  {
    files: ['src/renderer/src/**/*.{ts,tsx}', 'src/debug/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true }
      ]
    }
  },
  {
    files: [
      'electron.vite.config.ts',
      'electron.vite.debug.config.ts',
      'electron.vite.shared.ts',
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'src/shared/**/*.ts',
      'src/debug/main/**/*.ts',
      'src/debug/preload/**/*.ts',
      'src/debug/shared/**/*.ts'
    ],
    languageOptions: {
      globals: globals.node
    }
  }
)
