/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#10151C',
        dawn: '#E8DCC8',
        ground: '#FAF8F4',
        surface: '#FFFFFF',
        line: '#E2D9CB',
        inksoft: '#3B4552',
        signal: {
          amber: '#C9822E',
          teal: '#2B6E68',
          rust: '#A13D2E',
          slate: '#7A8699',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
