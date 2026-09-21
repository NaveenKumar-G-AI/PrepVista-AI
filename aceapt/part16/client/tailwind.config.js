/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        porcelain: '#F3F5F4',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#14213D',
          soft: '#3A4664',
        },
        line: '#DCE1E0',
        muted: '#6B7280',
        signal: {
          gold: '#B8842E',
          goldSoft: '#F1E4CC',
          teal: '#2B6F63',
          tealSoft: '#DCEBE7',
          rose: '#B14338',
          roseSoft: '#F3DEDB',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
      },
      boxShadow: {
        panel: '0 1px 2px rgba(20, 33, 61, 0.06)',
      },
    },
  },
  plugins: [],
};
