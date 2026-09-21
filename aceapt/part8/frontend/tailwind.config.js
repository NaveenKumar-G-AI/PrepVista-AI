/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F6F5",
        "paper-raised": "#FFFFFF",
        ink: "#16233A",
        "ink-soft": "#4A5568",
        "ink-faint": "#8792A2",
        line: "#DADFDC",
        "line-soft": "#E7EAE7",
        verified: {
          DEFAULT: "#0E6E5C",
          soft: "#E3F0EC",
          line: "#0E6E5C",
        },
        caution: {
          DEFAULT: "#A8712A",
          soft: "#F5EBDC",
        },
        regressed: {
          DEFAULT: "#9B4A3F",
          soft: "#F3E4E1",
        },
        provisional: {
          DEFAULT: "#3E5C76",
          soft: "#E7ECF1",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "6px",
        lg: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(22, 35, 58, 0.06), 0 1px 1px rgba(22, 35, 58, 0.04)",
        raised: "0 2px 8px rgba(22, 35, 58, 0.08), 0 1px 2px rgba(22, 35, 58, 0.06)",
      },
    },
  },
  plugins: [],
};
