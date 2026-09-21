import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B1220",
          900: "#111A2E",
          800: "#1B2740",
          700: "#28365640",
        },
        paper: {
          50: "#F7F8FB",
          100: "#EEF1F7",
          200: "#E2E7F0",
        },
        signal: {
          DEFAULT: "#3454D1",
          600: "#2C46B8",
          400: "#5C77E0",
          100: "#E6EAFC",
        },
        measure: {
          DEFAULT: "#C97A3D",
          100: "#FAECDE",
        },
        good: "#1E8E6F",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,18,32,0.04), 0 8px 24px -12px rgba(11,18,32,0.12)",
        cardHover: "0 2px 4px rgba(11,18,32,0.06), 0 16px 32px -12px rgba(11,18,32,0.18)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.3s ease-out both",
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
