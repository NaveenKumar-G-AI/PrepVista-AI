/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14181C',
        paper: '#F2F4F2',
        panel: '#FFFFFF',
        line: '#DDE3DF',
        muted: '#5B6560',
        teal: '#1F6F63',
        tealSoft: '#E3EFEB',
        risk: '#B3452F',
        riskSoft: '#F6E9E5'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        panel: '0 1px 2px rgba(20,24,28,0.04), 0 8px 24px -12px rgba(20,24,28,0.12)'
      }
    }
  },
  plugins: []
};
