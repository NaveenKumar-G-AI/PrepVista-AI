import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}', './preview/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        align: {
          bg: 'var(--align-bg)',
          surface: 'var(--align-surface)',
          'surface-raised': 'var(--align-surface-raised)',
          border: 'var(--align-border)',
          'border-strong': 'var(--align-border-strong)',
          'text-primary': 'var(--align-text-primary)',
          'text-secondary': 'var(--align-text-secondary)',
          'text-tertiary': 'var(--align-text-tertiary)',
          fit: 'var(--align-fit)',
          'fit-dim': 'var(--align-fit-dim)',
          readiness: 'var(--align-readiness)',
          'readiness-dim': 'var(--align-readiness-dim)',
          caution: 'var(--align-caution)',
          critical: 'var(--align-critical)',
        },
      },
      fontFamily: {
        display: ['var(--align-font-display)'],
        body: ['var(--align-font-body)'],
        mono: ['var(--align-font-mono)'],
      },
    },
  },
  plugins: [],
} satisfies Config;
