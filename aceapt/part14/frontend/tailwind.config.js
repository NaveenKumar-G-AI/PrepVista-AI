/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#F6F7F5',
        'surface-raised': '#FFFFFF',
        ink: {
          900: '#14181C',
          700: '#2B3339',
          600: '#4B5563',
          400: '#8A93A0',
        },
        line: '#E2E5E1',
        accent: {
          DEFAULT: '#1F6F5C',
          soft: '#E4EFEA',
          700: '#175545',
        },
        warn: {
          DEFAULT: '#B45309',
          soft: '#FBEEDD',
        },
        neutral: {
          DEFAULT: '#6B7280',
          soft: '#EEF0F2',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '10px',
        lg: '14px',
        sm: '6px',
      },
    },
  },
  plugins: [],
};
