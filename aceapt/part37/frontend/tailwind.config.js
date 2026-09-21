/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14213D',
        paper: '#F7F6F2',
        'paper-dim': '#ECEAE3',
        'paper-line': '#DEDBD1',
        evidence: {
          DEFAULT: '#1F6F5C',
          soft: '#E4EFEA',
        },
        pending: {
          DEFAULT: '#B8892B',
          soft: '#F5ECDA',
        },
        gap: {
          DEFAULT: '#B5432E',
          soft: '#F5E4DF',
        },
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};
