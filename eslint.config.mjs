import js from '@eslint/js';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  {
    files: ['backend/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['backend/tests/**/*.js'],
    languageOptions: { globals: globals.jest },
  },
  {
    files: ['backend/middlewares/errorHandler.js'],
    // Express identifica los manejadores de errores por sus cuatro parámetros.
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_next$', reportUsedIgnorePattern: true }] },
  },
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': hooks },
    rules: hooks.configs.recommended.rules,
  },
  {
    files: ['frontend/vite.config.js'],
    languageOptions: { globals: globals.node },
  },
];
