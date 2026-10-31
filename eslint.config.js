import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src-tauri/target', 'playwright-report', 'test-results', '.yarn'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@tauri-apps/*',
            'react',
            'react-dom',
            '@/adapters/*',
            '@/ui/*',
            // The same layers reached by a relative path.
            '**/adapters/**',
            '**/ui/**',
          ],
        },
      ],
    },
  },
  {
    // SQL lives in core repos; the UI calls core functions.
    files: ['src/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(select|execute)$/]",
          message: 'Do not write SQL in the UI: add a function to a core repo (src/core/db/repos) and call it.',
        },
      ],
    },
  },
);
