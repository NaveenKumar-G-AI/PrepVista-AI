/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F1B2D',
        panel: '#172A42',
        panel2: '#1D3350',
        line: '#2A3D59',
        ivory: '#EDF1F7',
        slate: {
          DEFAULT: '#8DA0B8',
          dim: '#5E7291',
        },
        amber: '#F0A83C',
        teal: '#3FBF8F',
        rose: '#E2584B',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(237,241,247,0.04) inset, 0 12px 32px -16px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
};
