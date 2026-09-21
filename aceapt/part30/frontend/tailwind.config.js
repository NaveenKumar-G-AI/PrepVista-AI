/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          bg: "#0B0E14",
          surface: "#12161F",
          surface2: "#181D28",
          border: "#252B38",
        },
        ink: {
          1: "#E8E6E1",
          2: "#ABB2C0",
          3: "#6B7280",
        },
        route: {
          DEFAULT: "#C99A5B",
          soft: "#8A7048",
        },
        verified: {
          DEFAULT: "#4FA8A0",
          soft: "#2E5C57",
        },
        risk: {
          DEFAULT: "#C1614A",
          soft: "#5C3229",
        },
      },
      fontFamily: {
        display: ["\"Instrument Serif\"", "Georgia", "serif"],
        body: ["\"IBM Plex Sans\"", "system-ui", "sans-serif"],
        mono: ["\"IBM Plex Mono\"", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
