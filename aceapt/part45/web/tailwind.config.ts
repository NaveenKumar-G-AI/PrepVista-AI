import type { Config } from 'tailwindcss';

// Design language: the skill graph is a curriculum "transit map" — each
// domain is a line (Quant/Logical/Verbal), each skill is a station, and
// capability is how "charged" a station is. Colors below are that map's
// three line colors plus one reserved "you are here" marker. See
// web/DESIGN.md for the full rationale.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F8F4',
        ink: '#1B2430',
        'ink-soft': '#4A5568',
        line: '#D8DCD3',
        quant: { DEFAULT: '#3A6EA5', soft: '#E4ECF4' },
        logic: { DEFAULT: '#6B4C9A', soft: '#EBE5F3' },
        verbal: { DEFAULT: '#1F7A5C', soft: '#E1EEE8' },
        focus: { DEFAULT: '#C98A1B', soft: '#FBF0DC' },
        warn: { DEFAULT: '#B3401F', soft: '#F7E6E0' },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        card: '0.7rem',
      },
      boxShadow: {
        station: '0 1px 2px rgba(27,36,48,0.08), 0 1px 1px rgba(27,36,48,0.04)',
      },
    },
  },
  plugins: [],
} satisfies Config;
