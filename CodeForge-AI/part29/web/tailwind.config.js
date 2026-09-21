/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14171C",
        surface: "#F1F2ED",
        raised: "#FFFFFF",
        line: "#D8DAD2",
        signal: "#24484C",
        growth: "#3C6E47",
        regression: "#9B3B3B",
        milestone: "#A8791F",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
        body: ["'Inter'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
