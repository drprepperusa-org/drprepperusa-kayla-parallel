import tsParser from '@typescript-eslint/parser';
import ts from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.vercel/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    settings: {
      react: { version: 'detect' },
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        React: true,
        JSX: true,
        fetch: true,
        window: true,
        document: true,
        localStorage: true,
        sessionStorage: true,
        console: true,
        process: true,
        setTimeout: true,
        clearTimeout: true,
        ReturnType: true,
      },
    },
    plugins: {
      '@typescript-eslint': ts,
      'react': react,
      'react-hooks': reactHooks,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': ['error', { ignoreRestArgs: true }],
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-duplicate-imports': 'error',
      'no-unreachable': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    rules: {
      'react/display-name': 'off',
      'react/require-render-return': 'error',
    },
  },
];
