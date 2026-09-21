/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#10233F",
          800: "#16304F",
          700: "#2B3542",
        },
        paper: {
          50: "#F8F9F7",
          100: "#EEF1EE",
          200: "#E2E6E1",
        },
        signal: {
          cyan: "#2E9C90",
          cyanDark: "#1F7B71",
          amber: "#D98E2B",
          rust: "#B0472E",
        },
      },
      fontFamily: {
        display: ["\"Space Grotesk\"", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["\"IBM Plex Mono\"", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,35,63,0.06), 0 8px 24px -12px rgba(16,35,63,0.18)",
      },
    },
  },
  plugins: [],
};
