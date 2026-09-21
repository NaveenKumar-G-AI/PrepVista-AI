import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        console: {
          bg: "#0A0D13",
          surface: "#11151E",
          raised: "#171C27",
          border: "#252B38",
          borderMuted: "#1B2029",
          text: "#E7EAF2",
          textMuted: "#8B93A8",
          textFaint: "#5C6478",
        },
        accent: {
          DEFAULT: "#6C7CFF",
          dim: "#4A52A8",
          glow: "#8B96FF",
        },
        sev: {
          critical: "#F0475A",
          high: "#F2884E",
          medium: "#E8B93F",
          low: "#4FA8E0",
          healthy: "#3DD68C",
        },
      },
      fontFamily: {
        mono: [
          "IBM Plex Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
        sans: [
          "IBM Plex Sans",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.5)",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        flow: {
          "0%": { strokeDashoffset: "24" },
          "100%": { strokeDashoffset: "0" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
        flow: "flow 1s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
