/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F5F2",
        surface: "#FFFFFF",
        ink: "#171B1A",
        "ink-soft": "#55605C",
        "ink-faint": "#8B948F",
        line: "#DDE1DC",
        harbor: {
          DEFAULT: "#1E3D3A",
          strong: "#142B29",
          soft: "#2E5652",
        },
        gold: "#A9782F",
        signal: {
          strong: "#2F7A52",
          healthy: "#3E8A5C",
          neutral: "#8B948F",
          cooling: "#B9791E",
          risk: "#B23B33",
          inactive: "#8A8579",
        },
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23, 27, 26, 0.04), 0 1px 8px rgba(23, 27, 26, 0.04)",
      },
    },
  },
  plugins: [],
};
