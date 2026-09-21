/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#080D16",
          900: "#0B1220",
          800: "#121B2E",
          700: "#1A2537",
          600: "#25314A",
          500: "#3A4A68",
        },
        paper: {
          100: "#EDF1F7",
          300: "#C4CEDD",
          500: "#8794A8",
        },
        signal: {
          ready: "#4FD1A5",
          readyDim: "#2C7A5C",
          developing: "#E3A857",
          developingDim: "#8A6530",
          risk: "#E0667A",
          riskDim: "#8C3E4A",
        },
      },
      fontFamily: {
        display: ["\"Space Grotesk\"", "sans-serif"],
        sans: ["\"IBM Plex Sans\"", "sans-serif"],
        mono: ["\"IBM Plex Mono\"", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(237, 241, 247, 0.04) inset, 0 0 0 1px rgba(237, 241, 247, 0.06)",
      },
    },
  },
  plugins: [],
};
