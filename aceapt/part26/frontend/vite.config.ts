import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // The frontend calls same-origin `/api/...` paths; Vite forwards them
      // to the Express backend in dev so there's no CORS to think about.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  }
});
