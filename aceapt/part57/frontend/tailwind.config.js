/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F4F6F2',
        surface: '#FBFCFA',
        ink: '#16241F',
        inksoft: '#4B5A53',
        line: '#D9DFD6',
        verified: '#1F6F5C',
        verifiedbg: '#E4F0EB',
        caution: '#9C5B12',
        cautionbg: '#F5E9DA',
        focus: '#33427D',
        focusbg: '#E6E9F3',
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Work Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
