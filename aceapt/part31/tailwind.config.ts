import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12151A',
        panel: '#1A1E26',
        raised: '#232833',
        line: '#2E3440',
        signal: '#4C8DFF',
        'signal-dim': '#2B4A80',
        ready: '#34D399',
        caution: '#F5A623',
        critical: '#F26D6D',
        'text-1': '#F3F5F8',
        'text-2': '#97A1B3',
        'text-3': '#5C6577',
      },
      fontFamily: {
        sans: ['ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', '"Cascadia Code"', '"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.03em',
        widest2: '0.2em',
      },
      keyframes: {
        rise: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        drawArc: { '0%': { strokeDashoffset: '1000' }, '100%': { strokeDashoffset: '0' } },
      },
      animation: {
        rise: 'rise 0.4s ease-out both',
        drawArc: 'drawArc 1s cubic-bezier(0.4,0,0.2,1) forwards',
      },
    },
  },
  plugins: [],
};

export default config;
