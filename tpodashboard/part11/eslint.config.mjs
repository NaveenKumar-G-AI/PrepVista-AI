import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'coverage/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Repository code intentionally deals with raw SQLite rows (untyped
      // driver results) and Express error handlers — `any` shows up at
      // those explicit boundaries, not as a substitute for real typing.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
