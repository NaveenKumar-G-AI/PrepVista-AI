/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F6F3",
        surface: "#FFFFFF",
        ink: {
          DEFAULT: "#15181B",
          muted: "#565C57",
          faint: "#8B9188",
        },
        line: "#DDE1DA",
        accent: {
          DEFAULT: "#1F6E63",
          soft: "#E4EFEC",
        },
        ochre: {
          DEFAULT: "#A9701F",
          soft: "#F3E9DA",
        },
        danger: "#B3261E",
      },
      fontFamily: {
        display: ["\"Space Grotesk\"", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
