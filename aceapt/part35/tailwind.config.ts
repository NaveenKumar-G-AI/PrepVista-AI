import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: '#EEF0EC',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#1B2420',
          soft: '#38423D',
        },
        muted: '#5B655C',
        line: '#DBDFD8',
        pine: {
          DEFAULT: '#3D6B52',
          strong: '#2B4E3B',
          soft: '#E3EBE4',
        },
        clay: {
          DEFAULT: '#A66A2E',
          strong: '#7E4F22',
          soft: '#F2E6D6',
        },
      },
      fontFamily: {
        display: [
          'Iowan Old Style',
          'Palatino Linotype',
          'Palatino',
          'Georgia',
          'ui-serif',
          'serif',
        ],
        body: [
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SF Mono',
          'Cascadia Code',
          'Roboto Mono',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      borderRadius: {
        card: '14px',
        tag: '999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(27, 36, 32, 0.04), 0 1px 1px rgba(27, 36, 32, 0.03)',
      },
      keyframes: {
        'grow-w': { from: { width: '0%' }, to: { width: 'var(--target-w, 100%)' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'grow-w': 'grow-w 700ms cubic-bezier(0.22,1,0.36,1) forwards',
        'fade-up': 'fade-up 400ms ease-out forwards',
      },
    },
  },
  plugins: [],
};

export default config;
