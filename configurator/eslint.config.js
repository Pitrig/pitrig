import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const productSources = [
  'src/main/**/*.{ts,tsx,js,mjs,cjs,mts}',
  'src/preload/**/*.{ts,tsx,js,mjs,cjs,mts}',
  'src/renderer/**/*.{ts,tsx,js,mjs,cjs,mts}',
  'src/shared/**/*.{ts,tsx,js,mjs,cjs,mts}'
]

const noDebugImportExpression = {
  selector: 'ImportExpression > Literal[value=/(^|\\/)debug\\/|^@debug-shared\\//]',
  message:
    'The product must not import debug code. Debug tooling lives in src/debug and depends on the product, never the other way round.'
}

const uiTextMessage =
  'User-visible text belongs in i18n/en.json. Draw it with t() from @shared/ui-text.'

const textAttributes =
  'alt|aria-description|aria-label|buttonLabel|capacityNote|caption|confirmLabel|description|disabledReason|emptyText|heading|hint|label|message|notice|noun|placeholder|reason|subtitle|summary|title|tooltip|valueTitle'

const valueAttributes =
  'className|style|key|id|htmlFor|type|role|href|src|on[A-Z].*|value|variant|aria-current|clipId|clipPath|dominantBaseline|fill|filter|floodColor|pointerEvents|strokeLinecap|textAnchor|transform'

const drawnContainers = [
  `JSXAttribute[name.name!=/^(${valueAttributes})$/] > JSXExpressionContainer`,
  'JSXElement > JSXExpressionContainer',
  'JSXFragment > JSXExpressionContainer'
]

const drawnChoices = [
  '',
  ' > :matches(ConditionalExpression, LogicalExpression)',
  ' > :matches(ConditionalExpression, LogicalExpression) > :matches(ConditionalExpression, LogicalExpression)'
]

const drawnLiterals = [
  'Literal[value=/[A-Za-z]{2}/]',
  'TemplateLiteral > TemplateElement[value.raw=/[A-Za-z]{2}/]'
]

const noLiteralUiText = [
  { selector: 'JSXText[value=/[A-Za-z]{2}/]', message: uiTextMessage },
  {
    selector: `JSXAttribute[name.name=/^(${textAttributes})$/] > Literal[value=/[A-Za-z]{2}/]`,
    message: uiTextMessage
  },
  ...drawnContainers.flatMap((container) =>
    drawnChoices.flatMap((choice) =>
      drawnLiterals.map((literal) => ({
        selector: `${container}${choice} > ${literal}`,
        message: uiTextMessage
      }))
    )
  )
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
      ],
      'no-restricted-syntax': ['error', noDebugImportExpression]
    }
  },
  {
    files: ['src/renderer/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', noDebugImportExpression, ...noLiteralUiText]
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
