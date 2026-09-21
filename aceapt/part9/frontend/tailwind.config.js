/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12151A',
        inkline: '#262B33',
        bone: '#F2EFE7',
        boneline: '#DAD5C8',
        brass: '#9C7A2E',
        brasslight: '#C6A75A',
        moss: '#3C6B52',
        mosslight: '#5C9075',
        rust: '#8B3A2B',
        rustlight: '#B85B48',
        slate: '#565B63',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
