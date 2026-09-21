/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F5F6F2',
        panel: '#FFFFFF',
        ink: '#1C2420',
        'ink-soft': '#5B655D',
        grid: '#DCE0D8',
        brass: '#8C6A3F',
        'brass-light': '#B79363',
        verdigris: '#3D6B63',
        'verdigris-light': '#E4EDE9',
        ochre: '#A67C1E',
        'ochre-light': '#F3E9D2',
        rust: '#9C4A3C',
        'rust-light': '#F3E1DD',
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        'graph-grid':
          'linear-gradient(to right, var(--tw-grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--tw-grid-line) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
